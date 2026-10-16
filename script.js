const firebaseConfig = {
  apiKey: "AIzaSyBxpPwb6ZFmbAc4KH7VVQwGo0G9d-PJwAM",
  authDomain: "malabar-idiyappam.firebaseapp.com",
  projectId: "malabar-idiyappam",
  storageBucket: "malabar-idiyappam.firebasestorage.app",
  messagingSenderId: "246016481020",
  appId: "1:246016481020:web:3c2bacd8cd150cc6c4a979",
  measurementId: "G-SD8SP8RNT3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

let registeredStoresList = [];
let currentOrdersList = [];
let currentMetricsData = null;

function formatDateToDMY(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}-${parts[1]}-${parts[0]}`;
  return dateStr;
}

function parseQuantityBreakdown(valStr) {
  if (!valStr) return { total: 0, raw: '', packets: [] };
  const str = String(valStr).trim();
  if (!str) return { total: 0, raw: '', packets: [] };

  const parts = str.split('+').map(p => parseInt(p.trim(), 10)).filter(n => !isNaN(n) && n > 0);
  const total = parts.reduce((sum, n) => sum + n, 0);
  return { total, raw: str, packets: parts };
}

document.addEventListener('DOMContentLoaded', () => {
  checkSessionState();
  setDefaultDates();
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('bulk-qty-field')) {
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll('.bulk-qty-field'));
      const idx = inputs.indexOf(e.target);
      if (idx > -1 && inputs[idx + 1]) {
        inputs[idx + 1].focus();
        inputs[idx + 1].select();
      }
    }
  });
});

function setDefaultDates() {
  const today = new Date().toISOString().split('T')[0];
  ['bulk-order-date', 'order-delivery-date', 'production-date-filter'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
  const mPicker = document.getElementById('calendar-month-picker');
  if (mPicker && !mPicker.value) {
    mPicker.value = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  }
}

function checkSessionState() {
  const user = localStorage.getItem('snec_authenticated_user');
  if (user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    loadStoreOptions();
    fetchProductionMetrics();
    switchTab('tab-home');
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
  }
}

function confirmLogout() {
  localStorage.removeItem('snec_authenticated_user');
  checkSessionState();
}

function switchTab(tabId, event) {
  if (event) event.preventDefault();
  document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  
  const targetSection = document.getElementById(tabId);
  if (targetSection) targetSection.classList.add('active');

  document.querySelectorAll('.nav-link').forEach(el => {
    if (el.getAttribute('onclick') && el.getAttribute('onclick').includes(tabId)) {
      el.classList.add('active');
    }
  });

  if (tabId === 'tab-bulk-orders') loadBulkOrderSheet();
  if (tabId === 'tab-calendar') renderMonthlyCalendar();
  if (tabId === 'tab-production' || tabId === 'tab-delivery' || tabId === 'tab-accounts') fetchProductionMetrics();
}

function refreshDirectoryData() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('fa-spin');
  loadStoreOptions();
  fetchProductionMetrics();
  setTimeout(() => {
    if (icon) icon.classList.remove('fa-spin');
    showModal('Refreshed', 'Data updated!', 'success');
  }, 500);
}

function loadStoreOptions() {
  db.collection("stores").onSnapshot(snapshot => {
    registeredStoresList = [];
    let maxId = 0;

    snapshot.forEach(doc => {
      const store = { id: doc.id, ...doc.data() };
      store.storeOrder = store.storeOrder !== undefined ? store.storeOrder : 9999;
      registeredStoresList.push(store);

      const numId = parseInt(doc.id, 10);
      if (!isNaN(numId) && numId > maxId) maxId = numId;
    });

    registeredStoresList.sort((a, b) => a.storeOrder - b.storeOrder);

    const tableBody = document.getElementById('sortable-store-tbody');
    if (tableBody) {
      tableBody.innerHTML = '';
      registeredStoresList.forEach((store, index) => {
        tableBody.innerHTML += `
          <tr draggable="true" class="draggable-row" data-store-id="${store.id}" ondragstart="onDragStart(event)" ondragover="onDragOver(event)" ondrop="onDrop(event)" ondragend="onDragEnd(event)">
            <td><strong>${index + 1}</strong></td>
            <td style="display:none;">${store.id}</td>
            <td><strong>${store.storeName}</strong></td>
            <td><small style="color:#64748b;">${store.route || ''}</small></td>
            <td>${store.mobile || '-'}</td>
            <td style="text-align: center; white-space: nowrap;">
              <button class="btn btn-edit btn-pill btn-xs" onclick="openEditStoreModal('${store.id}')" title="Edit">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              ${store.whatsapp || store.mobile ? `
                <a href="https://wa.me/91${store.whatsapp || store.mobile}" target="_blank" class="btn btn-whatsapp btn-pill btn-xs" title="WhatsApp">
                  <i class="fa-brands fa-whatsapp"></i>
                </a>` : ''}
              <button class="btn btn-delete btn-pill btn-xs" onclick="deleteStore('${store.id}', '${store.storeName}')" title="Delete">
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>`;
      });
    }

    const nextIdField = document.getElementById('reg-store-id');
    if (nextIdField) nextIdField.value = maxId + 1;

    const badge = document.getElementById('store-count-badge');
    if (badge) badge.innerText = `${registeredStoresList.length} Stores`;
    
    loadBulkOrderSheet();
  });
}

// Drag and Drop Functions
let draggedRow = null;

function onDragStart(e) {
  draggedRow = e.currentTarget;
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  const targetRow = e.target.closest('tr');
  const tbody = document.getElementById('sortable-store-tbody');
  if (targetRow && targetRow !== draggedRow) {
    const rect = targetRow.getBoundingClientRect();
    const next = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
    tbody.insertBefore(draggedRow, next ? targetRow.nextSibling : targetRow);
  }
}

function onDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  draggedRow = null;
  saveNewOrderSequence();
}

function saveNewOrderSequence() {
  const rows = document.querySelectorAll('#sortable-store-tbody tr');
  const batch = db.batch();
  
  rows.forEach((row, index) => {
    const storeId = row.getAttribute('data-store-id');
    const store = registeredStoresList.find(s => s.id === storeId);
    if (store) {
      store.storeOrder = index + 1;
      const storeRef = db.collection("stores").doc(storeId);
      batch.update(storeRef, { storeOrder: index + 1 });
    }
  });

  batch.commit().then(() => {
    registeredStoresList.sort((a, b) => a.storeOrder - b.storeOrder);
  });
}

function loadBulkOrderSheet() {
  const container = document.getElementById('bulk-cards-container');
  if (!container) return;
  container.innerHTML = '';

  const selectedDate = document.getElementById('bulk-order-date').value || new Date().toISOString().split('T')[0];
  const selectedRoute = document.getElementById('bulk-route-filter').value;
  const searchQuery = document.getElementById('bulk-store-search-filter') ? document.getElementById('bulk-store-search-filter').value.toLowerCase().trim() : '';

  let filteredStores = registeredStoresList;
  
  if (selectedRoute !== 'ALL') {
    filteredStores = filteredStores.filter(s => s.route === selectedRoute);
  }

  if (searchQuery) {
    filteredStores = filteredStores.filter(s => s.storeName.toLowerCase().includes(searchQuery) || String(s.id).includes(searchQuery));
  }

  if (filteredStores.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:20px; color:#94a3b8;">No stores found matching criteria.</div>';
    return;
  }

  filteredStores.forEach((store, index) => {
    const existingOrder = currentOrdersList.find(o => o.storeId === store.id && o.deliveryDate === selectedDate);
    
    const valIdi = existingOrder ? (existingOrder.idiyappamRaw || (existingOrder.idiyappam > 0 ? existingOrder.idiyappam : '')) : '';
    const valVel = existingOrder ? (existingOrder.vellayappamRaw || (existingOrder.vellayappam > 0 ? existingOrder.vellayappam : '')) : '';
    const valIdl = existingOrder ? (existingOrder.idliRaw || (existingOrder.idli > 0 ? existingOrder.idli : '')) : '';
    const orderDocId = existingOrder ? existingOrder.orderId : '';

    const card = `
      <div class="bulk-store-card" id="card-store-${store.id}" data-store-id="${store.id}" data-order-id="${orderDocId}">
        <div class="bulk-store-header">
          <div class="store-badge-title">
            <span class="store-id-tag">#${index + 1}</span>
            <span>${store.storeName}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <small style="color:#64748b; font-size:0.75rem;">${store.route || ''}</small>
            <button class="btn btn-danger-soft btn-pill btn-xs del-btn" id="del-btn-${store.id}" style="${orderDocId ? 'display:inline-flex;' : 'display:none;'}" onclick="deleteSingleStoreOrder('${store.id}', '${store.storeName}')" title="Cancel/Delete order">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="bulk-inputs-row">
          <div class="bulk-input-col">
            <label>ഇടിയപ്പം</label>
            <input type="text" placeholder="0" class="bulk-qty-field bulk-idi" value="${valIdi}" onfocus="this.select()">
          </div>
          <div class="bulk-input-col">
            <label>വെള്ളയപ്പം</label>
            <input type="text" placeholder="0" class="bulk-qty-field bulk-vel" value="${valVel}" onfocus="this.select()">
          </div>
          <div class="bulk-input-col">
            <label>ഇഡ്ഡലി</label>
            <input type="text" placeholder="0" class="bulk-qty-field bulk-idl" value="${valIdl}" onfocus="this.select()">
          </div>
        </div>
      </div>
    `;
    container.innerHTML += card;
  });
}

function deleteSingleStoreOrder(storeId, storeName) {
  const card = document.getElementById(`card-store-${storeId}`);
  const orderId = card ? card.dataset.orderId : null;

  if (!orderId) {
    if (card) {
      card.querySelectorAll('.bulk-qty-field').forEach(inp => inp.value = '');
    }
    return;
  }

  if (confirm(`Are you sure you want to cancel the order for ${storeName}?`)) {
    db.collection("orders").doc(orderId).delete().then(() => {
      if (card) {
        card.querySelectorAll('.bulk-qty-field').forEach(inp => inp.value = '');
        card.dataset.orderId = '';
        const delBtn = document.getElementById(`del-btn-${storeId}`);
        if (delBtn) delBtn.style.display = 'none';
      }
      showModal('Order Cancelled', `Order for ${storeName} has been cleared.`, 'success');
      fetchProductionMetrics();
    });
  }
}

function clearBulkOrderInputs() {
  document.querySelectorAll('.bulk-qty-field').forEach(input => input.value = '');
}

function saveBulkOrders() {
  const selectedDate = document.getElementById('bulk-order-date').value;
  const cards = document.querySelectorAll('.bulk-store-card');
  if (cards.length === 0) return;

  const batch = db.batch();
  let count = 0;

  cards.forEach(card => {
    const storeId = card.dataset.storeId;
    const existingOrderId = card.dataset.orderId;
    const store = registeredStoresList.find(s => s.id === storeId);
    if (!store) return;

    const idiParsed = parseQuantityBreakdown(card.querySelector('.bulk-idi').value);
    const velParsed = parseQuantityBreakdown(card.querySelector('.bulk-vel').value);
    const idlParsed = parseQuantityBreakdown(card.querySelector('.bulk-idl').value);

    if (idiParsed.total > 0 || velParsed.total > 0 || idlParsed.total > 0) {
      const totalAmount = (idiParsed.total * (store.priceIdiyappam || 5)) +
                          (velParsed.total * (store.priceVellayappam || 5)) +
                          (idlParsed.total * (store.priceIdli || 5));

      const payload = {
        storeId: store.id,
        storeName: store.storeName,
        storeOrder: store.storeOrder !== undefined ? store.storeOrder : 0,
        route: store.route || 'Route 1 - Morning',
        deliveryDate: selectedDate,
        idiyappam: idiParsed.total,
        idiyappamRaw: idiParsed.raw,
        idiyappamPackets: idiParsed.packets,
        vellayappam: velParsed.total,
        vellayappamRaw: velParsed.raw,
        vellayappamPackets: velParsed.packets,
        idli: idlParsed.total,
        idliRaw: idlParsed.raw,
        idliPackets: idlParsed.packets,
        totalAmount: totalAmount,
        paidAmount: 0,
        balanceDue: totalAmount,
        deliveryStatus: 'Pending',
        paymentStatus: 'Pending',
        timestamp: new Date()
      };

      if (existingOrderId) {
        batch.update(db.collection("orders").doc(existingOrderId), payload);
      } else {
        batch.set(db.collection("orders").doc(), payload);
      }
      count++;
    }
  });

  batch.commit().then(() => {
    showModal('Saved', `${count} orders recorded successfully!`, 'success');
    clearBulkOrderInputs();
    fetchProductionMetrics();
  });
}

function handleInstantSuggest() {
  const q = document.getElementById('order-store-search').value.toLowerCase().trim();
  const box = document.getElementById('suggest-box');
  box.innerHTML = '';

  if (!q) { box.style.display = 'none'; return; }

  const matches = registeredStoresList.filter(s => s.id.includes(q) || s.storeName.toLowerCase().includes(q));
  if (matches.length === 0) {
    box.innerHTML = '<div class="suggest-item" style="color:#94a3b8;">Store not found</div>';
    box.style.display = 'block';
    return;
  }

  matches.forEach(s => {
    const el = document.createElement('div');
    el.className = 'suggest-item';
    el.innerText = `${s.storeName}`;
    el.onclick = () => {
      document.getElementById('order-store-search').value = `${s.storeName}`;
      document.getElementById('selected-store-id').value = s.id;
      if (s.route) document.getElementById('order-route').value = s.route;
      box.style.display = 'none';
    };
    box.appendChild(el);
  });
  box.style.display = 'block';
}

document.getElementById('order-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const storeId = document.getElementById('selected-store-id').value;
  const store = registeredStoresList.find(s => s.id === storeId);
  if (!store) {
    showModal('Attention', 'Please select a store from the search list.', 'error');
    return;
  }

  const idiParsed = parseQuantityBreakdown(document.getElementById('qty-idiyappam').value);
  const velParsed = parseQuantityBreakdown(document.getElementById('qty-vellayappam').value);
  const idlParsed = parseQuantityBreakdown(document.getElementById('qty-idli').value);

  const totalAmount = (idiParsed.total * (store.priceIdiyappam || 5)) +
                      (velParsed.total * (store.priceVellayappam || 5)) +
                      (idlParsed.total * (store.priceIdli || 5));

  const payload = {
    storeId: store.id,
    storeName: store.storeName,
    storeOrder: store.storeOrder !== undefined ? store.storeOrder : 0,
    route: document.getElementById('order-route').value,
    deliveryDate: document.getElementById('order-delivery-date').value,
    idiyappam: idiParsed.total,
    idiyappamRaw: idiParsed.raw,
    idiyappamPackets: idiParsed.packets,
    vellayappam: velParsed.total,
    vellayappamRaw: velParsed.raw,
    vellayappamPackets: velParsed.packets,
    idli: idlParsed.total,
    idliRaw: idlParsed.raw,
    idliPackets: idlParsed.packets,
    totalAmount: totalAmount,
    paidAmount: 0,
    balanceDue: totalAmount,
    deliveryStatus: 'Pending',
    paymentStatus: 'Pending',
    timestamp: new Date()
  };

  db.collection("orders").add(payload).then(() => {
    showModal('Success', 'Order submitted successfully!', 'success');
    document.getElementById('order-form').reset();
    document.getElementById('selected-store-id').value = '';
    document.getElementById('order-store-search').value = '';
    setDefaultDates();
  });
});

function fetchProductionMetrics() {
  const selectedDate = document.getElementById('production-date-filter').value || new Date().toISOString().split('T')[0];

  db.collection("orders").onSnapshot(snapshot => {
    let totalIdi = 0, totalVel = 0, totalIdl = 0;
    let totalRev = 0, totalPaid = 0, totalPending = 0;
    let idiyappamPackets = {}, vellayappamPackets = {}, idliPackets = {}, routeSummary = {};
    let deliveryList = [], ledgerList = [];
    let calendarMap = {};

    currentOrdersList = [];

    snapshot.forEach(doc => {
      const o = { orderId: doc.id, ...doc.data() };
      currentOrdersList.push(o);

      const oDate = o.deliveryDate;
      if (oDate) {
        if (!calendarMap[oDate]) {
          calendarMap[oDate] = { idi: 0, vel: 0, idl: 0, orders: [] };
        }
        calendarMap[oDate].idi += Number(o.idiyappam || 0);
        calendarMap[oDate].vel += Number(o.vellayappam || 0);
        calendarMap[oDate].idl += Number(o.idli || 0);
        calendarMap[oDate].orders.push(o);
      }

      if (o.deliveryDate === selectedDate) {
        const idi = Number(o.idiyappam || 0), vel = Number(o.vellayappam || 0), idl = Number(o.idli || 0);
        totalIdi += idi; totalVel += vel; totalIdl += idl;

        const idiPkts = (o.idiyappamPackets && o.idiyappamPackets.length > 0) ? o.idiyappamPackets : (idi > 0 ? [idi] : []);
        idiPkts.forEach(p => idiyappamPackets[p] = (idiyappamPackets[p] || 0) + 1);

        const velPkts = (o.vellayappamPackets && o.vellayappamPackets.length > 0) ? o.vellayappamPackets : (vel > 0 ? [vel] : []);
        velPkts.forEach(p => vellayappamPackets[p] = (vellayappamPackets[p] || 0) + 1);

        const idlPkts = (o.idliPackets && o.idliPackets.length > 0) ? o.idliPackets : (idl > 0 ? [idl] : []);
        idlPkts.forEach(p => idliPackets[p] = (idliPackets[p] || 0) + 1);

        const r = o.route || 'General';
        if (!routeSummary[r]) routeSummary[r] = { idi: 0, vel: 0, idl: 0 };
        routeSummary[r].idi += idi; routeSummary[r].vel += vel; routeSummary[r].idl += idl;

        deliveryList.push(o);
      }

      totalRev += Number(o.totalAmount || 0);
      totalPaid += Number(o.paidAmount || 0);
      totalPending += Number(o.balanceDue || 0);
      ledgerList.push(o);
    });

    deliveryList.sort((a, b) => (a.storeOrder || 0) - (b.storeOrder || 0));

    currentMetricsData = { deliveryList, totalIdi, totalVel, totalIdl, idiyappamPackets, vellayappamPackets, idliPackets, routeSummary, selectedDate, calendarMap };

    document.getElementById('total-idiyappam').innerText = totalIdi;
    document.getElementById('total-vellayappam').innerText = totalVel;
    document.getElementById('total-idli').innerText = totalIdl;

    document.getElementById('acc-total-revenue').innerText = `₹${totalRev.toFixed(2)}`;
    document.getElementById('acc-total-collected').innerText = `₹${totalPaid.toFixed(2)}`;
    document.getElementById('acc-total-pending').innerText = `₹${totalPending.toFixed(2)}`;

    renderPacketPills('idiyappam-packets-list', idiyappamPackets);
    renderPacketPills('vellayappam-packets-list', vellayappamPackets);
    renderPacketPills('idli-packets-list', idliPackets);

    const routeTbody = document.querySelector('#route-table tbody');
    if (routeTbody) {
      routeTbody.innerHTML = '';
      for (let r in routeSummary) {
        routeTbody.innerHTML += `<tr><td><strong>${r}</strong></td><td>${routeSummary[r].idi}</td><td>${routeSummary[r].vel}</td><td>${routeSummary[r].idl}</td></tr>`;
      }
    }

    renderDeliveryTable(deliveryList);
    renderAccountsLedger(ledgerList);
    renderMonthlyCalendar();
  });
}

function renderMonthlyCalendar() {
  const picker = document.getElementById('calendar-month-picker');
  const container = document.getElementById('calendar-days-container');
  if (!picker || !container) return;

  const [year, month] = picker.value.split('-').map(Number);
  if (!year || !month) return;

  container.innerHTML = '';

  const headers = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  headers.forEach(h => container.innerHTML += `<div class="calendar-header">${h}</div>`);

  const firstDay = new Date(year, month - 1, 1).getDay();
  const totalDays = new Date(year, month, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    container.innerHTML += `<div style="background:transparent;"></div>`;
  }

  const map = (currentMetricsData && currentMetricsData.calendarMap) ? currentMetricsData.calendarMap : {};

  for (let day = 1; day <= totalDays; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayInfo = map[dateStr] || { idi: 0, vel: 0, idl: 0, orders: [] };

    const hasOrders = (dayInfo.idi > 0 || dayInfo.vel > 0 || dayInfo.idl > 0);
    const card = document.createElement('div');
    card.className = `calendar-day-card ${hasOrders ? 'active' : ''}`;
    card.innerHTML = `
      <div class="calendar-day-number">${day}</div>
      <div class="calendar-day-pills">
        ${dayInfo.idi > 0 ? `<span style="color:#1e3c72;">ഇ: ${dayInfo.idi}</span><br>` : ''}
        ${dayInfo.vel > 0 ? `<span style="color:#05c46b;">വെ: ${dayInfo.vel}</span><br>` : ''}
        ${dayInfo.idl > 0 ? `<span style="color:#2a5298;">ഇഡ്ഡ: ${dayInfo.idl}</span>` : ''}
        ${!hasOrders ? '<span style="color:#cbd5e1;">-</span>' : ''}
      </div>
    `;
    card.onclick = () => showCalendarDayDetail(dateStr, dayInfo);
    container.appendChild(card);
  }
}

function showCalendarDayDetail(dateStr, info) {
  const panel = document.getElementById('cal-day-detail-box');
  const text = document.getElementById('cal-selected-date-text');
  const listContainer = document.getElementById('cal-day-orders-list');
  if (!panel || !listContainer) return;

  panel.style.display = 'block';
  text.innerText = `Orders for ${formatDateToDMY(dateStr)} (ഇടിയപ്പം: ${info.idi}, വെള്ളയപ്പം: ${info.vel}, ഇഡ്ഡലി: ${info.idl})`;
  listContainer.innerHTML = '';

  if (!info.orders || info.orders.length === 0) {
    listContainer.innerHTML = '<div style="color:#94a3b8; text-align:center; padding:15px;">No orders found on this day.</div>';
    return;
  }
  
  let dayOrders = info.orders.sort((a,b) => (a.storeOrder || 0) - (b.storeOrder || 0));

  dayOrders.forEach(o => {
    listContainer.innerHTML += `
      <div class="bulk-store-card">
        <div class="bulk-store-header">
          <span class="store-badge-title">${o.storeName}</span>
          <small style="color:#64748b;">${o.route || ''}</small>
        </div>
        <div style="font-size:0.85rem; color:#334155; display:flex; gap:12px; flex-wrap:wrap;">
          <span>ഇടിയപ്പം: <strong>${o.idiyappamRaw || o.idiyappam}</strong></span>
          <span>വെള്ളയപ്പം: <strong>${o.vellayappamRaw || o.vellayappam}</strong></span>
          <span>ഇഡ്ഡലി: <strong>${o.idliRaw || o.idli}</strong></span>
          <span>Total: <strong>₹${o.totalAmount}</strong></span>
        </div>
      </div>
    `;
  });
  panel.scrollIntoView({ behavior: 'smooth' });
}

function renderPacketPills(id, obj) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = '';
  const keys = Object.keys(obj).sort((a,b) => Number(a) - Number(b));
  if (keys.length === 0) { el.innerHTML = '<span style="color:#94a3b8; font-size:0.8rem;">No orders</span>'; return; }
  keys.forEach(k => el.innerHTML += `<div class="packet-badge">${k} &times; ${obj[k]}</div>`);
}

function renderDeliveryTable(list) {
  const tbody = document.querySelector('#delivery-manifest-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach((item, index) => {
    const idiDisplay = item.idiyappamRaw ? `${item.idiyappam} <small style="color:#64748b;">(${item.idiyappamRaw})</small>` : item.idiyappam;
    const velDisplay = item.vellayappamRaw ? `${item.vellayappam} <small style="color:#64748b;">(${item.vellayappamRaw})</small>` : item.vellayappam;
    const idlDisplay = item.idliRaw ? `${item.idli} <small style="color:#64748b;">(${item.idliRaw})</small>` : item.idli;

    tbody.innerHTML += `<tr>
      <td><input type="checkbox" ${item.deliveryStatus === 'Delivered' ? 'checked' : ''} onchange="toggleDelivery('${item.orderId}', this.checked)"></td>
      <td><strong>${index + 1}</strong></td>
      <td>${item.storeName}</td>
      <td>${idiDisplay}</td>
      <td>${velDisplay}</td>
      <td>${idlDisplay}</td>
      <td><strong>₹${item.totalAmount}</strong></td>
    </tr>`;
  });
}

function renderAccountsLedger(list) {
  const tbody = document.querySelector('#accounts-ledger-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  list.forEach((item, index) => {
    tbody.innerHTML += `<tr>
      <td><input type="checkbox" ${item.paymentStatus === 'Paid' ? 'checked' : ''} onchange="togglePaid('${item.orderId}', this.checked, ${item.totalAmount})"></td>
      <td><strong>${index + 1}</strong></td>
      <td>${item.storeName}</td>
      <td>₹${item.totalAmount}</td>
      <td><strong style="color:${item.balanceDue > 0 ? 'red' : 'green'}">₹${item.balanceDue}</strong></td>
    </tr>`;
  });
}

function toggleDelivery(id, done) {
  db.collection("orders").doc(id).update({ deliveryStatus: done ? 'Delivered' : 'Pending' });
}

function togglePaid(id, paid, total) {
  db.collection("orders").doc(id).update({
    paidAmount: paid ? total : 0,
    balanceDue: paid ? 0 : total,
    paymentStatus: paid ? 'Paid' : 'Pending'
  });
}

document.getElementById('store-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const storeId = document.getElementById('reg-store-id').value;
  const data = {
    storeOrder: registeredStoresList.length > 0 ? registeredStoresList[registeredStoresList.length - 1].storeOrder + 1 : 1,
    storeName: document.getElementById('reg-store-name').value,
    ownerName: document.getElementById('reg-owner-name').value,
    mobile: document.getElementById('reg-mobile').value,
    whatsapp: document.getElementById('reg-whatsapp').value,
    route: document.getElementById('reg-route').value,
    priceIdiyappam: Number(document.getElementById('reg-price-idiyappam').value),
    priceVellayappam: Number(document.getElementById('reg-price-vellayappam').value),
    priceIdli: Number(document.getElementById('reg-price-idli').value)
  };

  db.collection("stores").doc(storeId).set(data).then(() => {
    showModal('Store Saved', `Store #${storeId} registered successfully!`, 'success');
    document.getElementById('store-form').reset();
  });
});

function openEditStoreModal(storeId) {
  const store = registeredStoresList.find(s => s.id === storeId);
  if (!store) return;

  document.getElementById('edit-store-id').value = store.id;
  document.getElementById('edit-store-name').value = store.storeName;
  document.getElementById('edit-owner-name').value = store.ownerName || '';
  document.getElementById('edit-mobile').value = store.mobile || '';
  document.getElementById('edit-whatsapp').value = store.whatsapp || '';
  document.getElementById('edit-route').value = store.route || 'Route 1 - Morning';
  document.getElementById('edit-price-idiyappam').value = store.priceIdiyappam || 5;
  document.getElementById('edit-price-vellayappam').value = store.priceVellayappam || 5;
  document.getElementById('edit-price-idli').value = store.priceIdli || 5;

  document.getElementById('edit-store-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-store-modal').classList.remove('active');
}

function submitStoreUpdate() {
  const id = document.getElementById('edit-store-id').value;
  const updateData = {
    storeName: document.getElementById('edit-store-name').value,
    ownerName: document.getElementById('edit-owner-name').value,
    mobile: document.getElementById('edit-mobile').value,
    whatsapp: document.getElementById('edit-whatsapp').value,
    route: document.getElementById('edit-route').value,
    priceIdiyappam: Number(document.getElementById('edit-price-idiyappam').value),
    priceVellayappam: Number(document.getElementById('edit-price-vellayappam').value),
    priceIdli: Number(document.getElementById('edit-price-idli').value)
  };

  db.collection("stores").doc(id).update(updateData).then(() => {
    closeEditModal();
    showModal('Updated', 'Store details updated!', 'success');
  });
}

function deleteStore(id, name) {
  if (confirm(`Are you sure you want to delete Store #${id} (${name})?`)) {
    db.collection("stores").doc(id).delete().then(() => {
      showModal('Deleted', 'Store removed.', 'success');
    });
  }
}

function openImportModal() { document.getElementById('import-modal').classList.add('active'); }
function closeImportModal() { document.getElementById('import-modal').classList.remove('active'); }

function processImportSheetData() {
  const raw = document.getElementById('import-sheet-data').value.trim();
  const lines = raw.split('\n');
  const batch = db.batch();
  let count = 0;

  lines.forEach((line, index) => {
    const cols = line.split('\t').map(c => c.trim());
    if (cols.length < 2 || cols[0].toLowerCase().includes('store id')) return;

    const storeId = cols[0];
    const storeName = cols[1];
    if (storeId && storeName) {
      batch.set(db.collection("stores").doc(storeId), {
        storeOrder: index + 1,
        storeName: storeName,
        ownerName: cols[3] || storeName,
        mobile: cols[4] || '',
        whatsapp: cols[5] || cols[4] || '',
        route: cols[6] || 'Route 1 - Morning',
        priceIdiyappam: parseFloat(cols[7]) || 5.0,
        priceVellayappam: parseFloat(cols[8]) || 5.0,
        priceIdli: parseFloat(cols[9]) || 5.0
      });
      count++;
    }
  });

  batch.commit().then(() => {
    closeImportModal();
    showModal('Import Complete', `${count} stores imported!`, 'success');
  });
}

function shareSingleItemWhatsApp(itemKey) {
  if (!currentMetricsData) return;
  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n`;
  let packetsObj = {}, totalQty = 0, itemName = "";

  if (itemKey === 'idiyappam') {
    itemName = "ഇടിയപ്പം";
    packetsObj = currentMetricsData.idiyappamPackets;
    totalQty = currentMetricsData.totalIdi;
  } else if (itemKey === 'vellayappam') {
    itemName = "വെള്ളയപ്പം";
    packetsObj = currentMetricsData.vellayappamPackets;
    totalQty = currentMetricsData.totalVel;
  } else if (itemKey === 'idli') {
    itemName = "ഇഡ്ഡലി";
    packetsObj = currentMetricsData.idliPackets;
    totalQty = currentMetricsData.totalIdl;
  }

  msg += `*${itemName} പാക്കിംഗ് വിവരങ്ങൾ*\n*തിയ്യതി: ${formatDateToDMY(currentMetricsData.selectedDate)}*\n------------------------------------\n*ആകെ ആവിശ്യമുള്ളത്: ${totalQty} എണ്ണം*\n\n*പാക്കിംഗ് കണക്കുകൾ (ടേബിൾ):*\n`;
  msg += `\`\`\`\n`;
  msg += `Qty    | പാക്കറ്റ് എണ്ണം\n`;
  msg += `---------------------\n`;
  const keys = Object.keys(packetsObj).sort((a,b) => Number(a) - Number(b));
  let hasPackets = false;
  keys.forEach(qty => {
    hasPackets = true;
    msg += `${String(qty).padEnd(5)} | ${packetsObj[qty]}\n`;
  });
  msg += `\`\`\``;

  if (!hasPackets) msg = `*${itemName} പാക്കിംഗ് വിവരങ്ങൾ*\n(ഓർഡറുകൾ ഇല്ല)`;

  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function shareProductionToWhatsApp() {
  if (!currentMetricsData) return;
  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n*പ്രൊഡക്ഷൻ & പാക്കിംഗ് വിവരങ്ങൾ*\n*തിയ്യതി: ${formatDateToDMY(currentMetricsData.selectedDate)}*\n------------------------------------\n\n*ആകെ വിവരങ്ങൾ:*\n• ഇടിയപ്പം: ${currentMetricsData.totalIdi}\n• വെള്ളയപ്പം: ${currentMetricsData.totalVel}\n• ഇഡ്ഡലി: ${currentMetricsData.totalIdl}\n\n*റൂട്ട് തിരിച്ചുള്ള വിവരങ്ങൾ (ടേബിൾ):*\n`;
  msg += `\`\`\`\n`;
  msg += `റൂട്ട്         | ഇടി | വെള്ള | ഇഡ്ഡ\n`;
  msg += `---------------------------------\n`;
  for (let route in currentMetricsData.routeSummary) {
    let rName = route.replace('Route ', 'R').replace(' - Morning', 'M').replace(' - Evening', 'E');
    msg += `${rName.padEnd(12)} | ${String(currentMetricsData.routeSummary[route].idi).padEnd(3)} | ${String(currentMetricsData.routeSummary[route].vel).padEnd(5)} | ${currentMetricsData.routeSummary[route].idl}\n`;
  }
  msg += `\`\`\``;
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

function shareDeliveryToWhatsApp() {
  if (!currentMetricsData || !currentMetricsData.deliveryList) return;
  const selectedRoute = document.getElementById('delivery-route-filter').value;
  let filteredList = currentMetricsData.deliveryList;

  if (selectedRoute !== 'ALL') {
    filteredList = currentMetricsData.deliveryList.filter(item => item.route === selectedRoute);
  }

  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n*ഡെലിവറി ഷീറ്റ്*\n*തിയ്യതി: ${formatDateToDMY(currentMetricsData.selectedDate)}*\n------------------------------------\n\n`;
  if (filteredList.length === 0) {
    msg += `ഈ റൂട്ടിൽ ഓർഡറുകൾ ഇല്ല.\n`;
  } else {
    msg += `\`\`\`\n`;
    msg += `Sl | കടയുടെ പേര്      | ഇടി | വെള്ള | ഇഡ്ഡ | തുക\n`;
    msg += `--------------------------------------------\n`;
    filteredList.forEach((item, index) => {
      let sName = item.storeName.length > 10 ? item.storeName.substring(0, 9) + '.' : item.storeName;
      msg += `${String(index + 1).padEnd(2)} | ${sName.padEnd(12)} | ${String(item.idiyappam).padEnd(3)} | ${String(item.vellayappam).padEnd(5)} | ${String(item.idli).padEnd(5)} | ₹${item.totalAmount}\n`;
    });
    msg += `\`\`\``;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const u = document.getElementById('login-user').value.trim();
  const p = document.getElementById('login-pass').value.trim();
  if ((u === 'admin' || u === '101') && p.length >= 4) {
    localStorage.setItem('snec_authenticated_user', JSON.stringify({ id: u }));
    checkSessionState();
  } else {
    showModal('Error', 'Invalid login credentials', 'error');
  }
});

function showModal(title, msg, type = 'info') {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-message').innerText = msg;
  document.getElementById('custom-modal').classList.add('active');
}
function closeModal() { document.getElementById('custom-modal').classList.remove('active'); }
