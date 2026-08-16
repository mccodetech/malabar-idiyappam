// 🌟 നിങ്ങളുടെ അപ്‌ഡേറ്റ് ചെയ്ത പുതിയ Apps Script Web App URL ഇവിടെ നൽകുക
const GAS_COMPANY_API_URL = "https://script.google.com/macros/s/AKfycbw_u09hYw49jpRC8oTG-IL1PyzJM5vSa125Y9ekoH22qp_UnVcuJmnLeRh4HQ9z4nif/exec";

function callCompanyGAS(action, payload, successCallback, failureCallback) {
  const reqData = Object.assign({ action: action }, payload);
  fetch(GAS_COMPANY_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(reqData)
  })
  .then(res => res.json())
  .then(data => { if (successCallback) successCallback(data); })
  .catch(err => { if (failureCallback) failureCallback(err); else console.error("Company API Error:", err); });
}

let registeredStoresList = [];
let currentMetricsData = null;
let pendingConfirmAction = null;
let isSubmittingOrder = false;

document.addEventListener('DOMContentLoaded', () => {
  checkSessionState();
  setupAdvancedKeyboardNav();
  setDefaultDeliveryDate();
  setMonthPickerDefault();
  
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#order-store-search') && !e.target.closest('#suggest-box')) {
      const suggestBox = document.getElementById('suggest-box');
      if (suggestBox) suggestBox.style.display = 'none';
    }
  });
});

function setDefaultDeliveryDate() {
  const dateInput = document.getElementById('order-delivery-date');
  const prodDateInput = document.getElementById('production-date-filter');
  const today = new Date().toISOString().split('T')[0];
  
  if (dateInput && !dateInput.value) dateInput.value = today;
  if (prodDateInput && !prodDateInput.value) prodDateInput.value = today;
}

function setMonthPickerDefault() {
  const mPicker = document.getElementById('calendar-month-picker');
  if (mPicker) {
    const today = new Date();
    const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    mPicker.value = yearMonth;
  }
}

function autoCopyOwnerName() {
  const storeName = document.getElementById('reg-store-name').value;
  const ownerInput = document.getElementById('reg-owner-name');
  if (ownerInput && (!ownerInput.value || ownerInput.dataset.autofilled === "true")) {
    ownerInput.value = storeName;
    ownerInput.dataset.autofilled = "true";
  }
}

function autoCopyWhatsapp(sourceId, targetId) {
  const sourceVal = document.getElementById(sourceId).value;
  const targetInput = document.getElementById(targetId);
  if (targetInput && (!targetInput.value || targetInput.dataset.autofilled === "true")) {
    targetInput.value = sourceVal;
    targetInput.dataset.autofilled = "true";
  }
}

function checkSessionState() {
  const storedUser = localStorage.getItem('snec_authenticated_user');
  if (storedUser) {
    const user = JSON.parse(storedUser);
    document.getElementById('user-display').innerText = `${user.storeName} (${user.id})`;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    loadStoreOptions();
    fetchProductionMetrics();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-screen').style.display = 'none';
  }
}

function confirmLogout() {
  showConfirmModal('ലോഗൗട്ട് ചെയ്യുക', 'നിങ്ങൾ സിസ്റ്റത്തിൽ നിന്ന് പുറത്തുകടക്കാൻ ഉറപ്പാണോ?', handleLogout);
}

function handleLogout() {
  localStorage.removeItem('snec_authenticated_user');
  sessionStorage.clear();
  checkSessionState();
  showModal('ലോഗൗട്ട് ചെയ്തു', 'സിസ്റ്റത്തിൽ നിന്നും പുറത്തുകടന്നു.', 'success');
}

async function pickContactNumber(targetInputId, whatsappTargetId = null) {
  if ('contacts' in navigator && 'select' in navigator.contacts) {
    try {
      const props = ['tel'];
      const contacts = await navigator.contacts.select(props, { multiple: false });
      if (contacts.length > 0 && contacts[0].tel && contacts[0].tel.length > 0) {
        const rawPhone = contacts[0].tel[0].replace(/\s+/g, '').replace(/-/g, '');
        document.getElementById(targetInputId).value = rawPhone;
        if (whatsappTargetId) {
          document.getElementById(whatsappTargetId).value = rawPhone;
        }
      }
    } catch (err) {
      showModal('Contact Picker', 'Contact selection was cancelled.', 'info');
    }
  } else {
    showModal('സന്ദേശം', 'Contact Picker API is supported on mobile browsers.', 'info');
  }
}

function setupAdvancedKeyboardNav() {
  const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
  inputs.forEach((input) => {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        if (this.tagName !== 'TEXTAREA' && this.type !== 'submit') {
          e.preventDefault();
          const currentIndex = inputs.indexOf(this);
          const nextInput = inputs[currentIndex + 1];
          if (nextInput) nextInput.focus();
        }
      }
    });
  });
}

function switchTab(tabId, event) {
  if (event) event.preventDefault();
  document.querySelectorAll('.section-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
  
  document.getElementById(tabId).classList.add('active');
  if (event) event.currentTarget.classList.add('active');

  if (tabId === 'tab-production' || tabId === 'tab-delivery' || tabId === 'tab-accounts' || tabId === 'tab-calendar') {
    fetchProductionMetrics();
  } else if (tabId === 'tab-orders' || tabId === 'tab-stores-dir') {
    loadStoreOptions();
  }
}

function refreshDirectoryData() {
  const icon = document.getElementById('refresh-icon');
  if (icon) icon.classList.add('fa-spin');
  
  loadStoreOptions();
  fetchProductionMetrics();

  setTimeout(() => {
    if (icon) icon.classList.remove('fa-spin');
    showModal('റീഫ്രഷ് ചെയ്തു', 'വിവരങ്ങൾ അപ്ഡേറ്റ് ചെയ്തു.', 'success');
  }, 800);
}

function triggerPrint(sectionId) {
  const element = document.getElementById(sectionId);
  element.classList.add('print-active');
  window.print();
  element.classList.remove('print-active');
}

function loadStoreOptions() {
  callCompanyGAS('getRegisteredStores', {}, res => {
    if (res.success) {
      registeredStoresList = res.stores;

      const tableBody = document.querySelector('#dashboard-stores-table tbody');
      if (!tableBody) return;
      tableBody.innerHTML = '';

      document.getElementById('store-count-badge').innerText = `${registeredStoresList.length} കടകൾ`;

      registeredStoresList.forEach(store => {
        const row = `<tr>
          <td><strong>${store.id}</strong></td>
          <td>${store.storeName}</td>
          <td>${store.ownerName}</td>
          <td>${store.mobile}</td>
          <td><span style="background: #e2e8f0; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem;">${store.route}</span></td>
          <td>
            <small style="color: #475569;">
              ഇടിയപ്പം: ₹${Number(store.priceIdiyappam).toFixed(2)}<br>
              വെള്ളയപ്പം: ₹${Number(store.priceVellayappam).toFixed(2)}<br>
              ഇഡ്ഡലി: ₹${Number(store.priceIdli).toFixed(2)}
            </small>
          </td>
          <td style="display: flex; gap: 6px;">
            <button class="btn btn-edit btn-pill" onclick="openEditStoreModal('${store.id}')">
              <i class="fa-solid fa-pen-to-square"></i> തിരുത്തുക
            </button>
            <button class="btn btn-delete btn-pill" onclick="confirmDeleteStore('${store.id}', '${store.storeName}')">
              <i class="fa-solid fa-trash"></i> മായ്ക്കുക
            </button>
            <a href="${store.whatsappLink}" target="_blank" class="btn btn-whatsapp btn-pill">
              <i class="fa-brands fa-whatsapp"></i> ചാറ്റ്
            </a>
          </td>
        </tr>`;
        tableBody.innerHTML += row;
      });
    }
  });
}

function handleInstantSuggest() {
  const query = document.getElementById('order-store-search').value.toLowerCase().trim();
  const suggestBox = document.getElementById('suggest-box');
  suggestBox.innerHTML = '';

  if (query.length === 0) {
    suggestBox.style.display = 'none';
    return;
  }

  const matches = registeredStoresList.filter(s => 
    s.id.toLowerCase().includes(query) ||
    s.storeName.toLowerCase().includes(query) ||
    s.mobile.toLowerCase().includes(query)
  );

  if (matches.length === 0) {
    suggestBox.innerHTML = '<div class="suggest-item" style="color: #94a3b8;">കട കണ്ടെത്താനായില്ല</div>';
    suggestBox.style.display = 'block';
    return;
  }

  matches.forEach(store => {
    const item = document.createElement('div');
    item.className = 'suggest-item';
    item.innerText = `${store.id} - ${store.storeName} (${store.mobile})`;
    item.onclick = () => selectStoreFromSuggest(store);
    suggestBox.appendChild(item);
  });

  suggestBox.style.display = 'block';
}

function selectStoreFromSuggest(store) {
  document.getElementById('order-store-search').value = `${store.id} - ${store.storeName}`;
  document.getElementById('selected-store-id').value = store.id;
  
  const routeSelect = document.getElementById('order-route');
  if (routeSelect) {
    routeSelect.value = store.route;
  }
  document.getElementById('suggest-box').style.display = 'none';
}

function toggleAccountPaidCheckbox(orderId, isChecked) {
  callCompanyGAS('recordBulkFullPayment', { orderIds: [orderId], isPaid: isChecked }, res => {
    if (res.success) fetchProductionMetrics();
  });
}

function toggleDeliveryCheck(orderId, isChecked) {
  const status = isChecked ? 'Delivered' : 'Pending';
  callCompanyGAS('updateDeliveryStatus', { orderIds: orderId, newStatus: status }, res => {
    if (res.success) fetchProductionMetrics();
  });
}

function markAllVisibleDelivered() {
  if (!currentMetricsData || !currentMetricsData.deliveryList) return;
  const selectedRoute = document.getElementById('delivery-route-filter').value;
  
  let targets = currentMetricsData.deliveryList;
  if (selectedRoute !== 'ALL') {
    targets = targets.filter(item => item.route === selectedRoute);
  }

  const ids = targets.map(t => t.orderId);
  if (ids.length === 0) return;

  showConfirmModal('എല്ലാം ഡെലിവറി ചെയ്തതായി മാറ്റുക', 'ശരിക്കും എല്ലാവർക്കും കൊടുത്തു കഴിഞ്ഞോ?', () => {
    callCompanyGAS('updateDeliveryStatus', { orderIds: ids, newStatus: 'Delivered' }, res => {
      showModal('അപ്ഡേറ്റ് ചെയ്തു', res.message, 'success');
      fetchProductionMetrics();
    });
  });
}

function openPaymentModal(orderId, balanceDue) {
  document.getElementById('pay-order-id').value = orderId;
  document.getElementById('pay-balance-due').value = `₹${Number(balanceDue).toFixed(2)}`;
  document.getElementById('pay-amount').value = balanceDue;
  document.getElementById('payment-modal').classList.add('active');
}

function closePaymentModal() {
  document.getElementById('payment-modal').classList.remove('active');
}

function submitPaymentRecord() {
  const orderId = document.getElementById('pay-order-id').value;
  const payAmount = document.getElementById('pay-amount').value;

  if (!payAmount || Number(payAmount) <= 0) {
    showModal('ശ്രദ്ധിക്കുക', 'കൃത്യമായ തുക രേഖപ്പെടുത്തുക.', 'error');
    return;
  }

  callCompanyGAS('recordStorePayment', { orderId: orderId, paymentAmount: payAmount }, res => {
    closePaymentModal();
    if (res.success) {
      showModal('സേവ് ചെയ്തു', res.message, 'success');
      fetchProductionMetrics();
    } else {
      showModal('പിശക്', res.message, 'error');
    }
  });
}

function renderDeliveryTable(deliveryList, filterRoute = 'ALL') {
  const delTbody = document.querySelector('#delivery-manifest-table tbody');
  if (!delTbody) return;
  delTbody.innerHTML = '';

  let itemsToDisplay = deliveryList;
  if (filterRoute !== 'ALL') {
    itemsToDisplay = deliveryList.filter(item => item.route === filterRoute);
  }

  if (itemsToDisplay.length === 0) {
    delTbody.innerHTML = '<tr><td colspan="9" style="text-align: center; color: #94a3b8;">ഓർഡറുകൾ ലഭ്യമല്ല.</td></tr>';
    return;
  }

  itemsToDisplay.forEach(item => {
    const isDelivered = item.deliveryStatus === 'Delivered';
    const escapedRoute = String(item.route).replace(/'/g, "\\'");
    const dRow = `<tr>
      <td>
        <input type="checkbox" style="width:20px; height:20px; cursor:pointer;" ${isDelivered ? 'checked' : ''} onchange="toggleDeliveryCheck('${item.orderId}', this.checked)">
      </td>
      <td><strong>${item.deliveryDate}</strong></td>
      <td><strong>${item.storeId}</strong></td>
      <td>${item.storeName}</td>
      <td>${item.idiyappam}</td>
      <td>${item.vellayappam}</td>
      <td>${item.idli}</td>
      <td><strong>₹${Number(item.totalAmount).toFixed(2)}</strong></td>
      <td style="display: flex; gap: 6px;">
        <button class="btn btn-edit btn-pill" onclick="openEditOrderModal('${item.orderId}', ${item.idiyappam}, ${item.vellayappam}, ${item.idli}, '${escapedRoute}')">
          <i class="fa-solid fa-pen-to-square"></i> തിരുത്തുക
        </button>
        <button class="btn btn-delete btn-pill" onclick="confirmDeleteOrder('${item.orderId}')">
          <i class="fa-solid fa-trash"></i> മായ്ക്കുക
        </button>
      </td>
    </tr>`;
    delTbody.innerHTML += dRow;
  });
}

function renderAccountsLedger(ledgerList) {
  const accTbody = document.querySelector('#accounts-ledger-table tbody');
  if (!accTbody) return;
  accTbody.innerHTML = '';

  if (ledgerList.length === 0) {
    accTbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8;">അക്കൗണ്ട് ലെഡ്ജർ വിവരങ്ങൾ ലഭ്യമല്ല.</td></tr>';
    return;
  }

  ledgerList.forEach(item => {
    const isFullyPaid = item.paymentStatus === 'Paid';
    const badgeColor = isFullyPaid ? 'var(--color-success)' : (item.paidAmount > 0 ? 'var(--color-info)' : 'var(--color-error)');

    const row = `<tr>
      <td style="text-align: center;">
        <input type="checkbox" style="width:22px; height:22px; cursor:pointer;" ${isFullyPaid ? 'checked' : ''} onchange="toggleAccountPaidCheckbox('${item.orderId}', this.checked)">
      </td>
      <td>${item.deliveryDate}</td>
      <td><strong>[${item.storeId}] ${item.storeName}</strong></td>
      <td>₹${Number(item.totalAmount).toFixed(2)}</td>
      <td>₹${Number(item.paidAmount).toFixed(2)}</td>
      <td><strong style="color: ${item.balanceDue > 0 ? 'var(--color-error)' : 'green'}">₹${Number(item.balanceDue).toFixed(2)}</strong></td>
      <td><span style="background:${badgeColor}; color:white; padding:4px 12px; border-radius:20px; font-size:0.8rem;">${isFullyPaid ? 'തീർത്തു' : (item.paidAmount > 0 ? 'ഭാഗികം' : 'തരാനുണ്ട്')}</span></td>
      <td style="display: flex; gap: 6px;">
        <button class="btn btn-pill btn-edit" style="padding: 4px 10px; font-size: 0.8rem;" onclick="openPaymentModal('${item.orderId}', ${item.balanceDue})">
          <i class="fa-solid fa-coins"></i> ഭാഗികം (Partial)
        </button>
      </td>
    </tr>`;
    accTbody.innerHTML += row;
  });
}

function renderMonthlyCalendar() {
  if (!currentMetricsData || !currentMetricsData.calendarMap) return;

  const mPickerVal = document.getElementById('calendar-month-picker').value;
  if (!mPickerVal) return;

  const [year, month] = mPickerVal.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const container = document.getElementById('calendar-days-container');
  if (!container) return;
  container.innerHTML = '';

  const dayHeaders = ['ഞായർ', 'തിങ്കൾ', 'ചൊവ്വ', 'ബുധൻ', 'വ്യാഴം', 'വെള്ളി', 'ശനി'];
  dayHeaders.forEach(dh => {
    container.innerHTML += `<div class="calendar-header">${dh}</div>`;
  });

  const firstDayIndex = new Date(year, month - 1, 1).getDay();
  for (let i = 0; i < firstDayIndex; i++) {
    container.innerHTML += `<div style="background: transparent;"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayData = currentMetricsData.calendarMap[dateStr] || { idiyappam: 0, vellayappam: 0, idli: 0, totalOrders: 0, orders: [] };

    const card = document.createElement('div');
    card.className = 'calendar-day-card';
    if (dayData.totalOrders > 0) card.style.borderColor = 'var(--color-info)';

    card.innerHTML = `
      <div class="calendar-day-number">${day}</div>
      <div class="calendar-day-pills">
        ${dayData.idiyappam > 0 ? `<span style="color:#1e3c72;">ഇ: ${dayData.idiyappam}</span><br>` : ''}
        ${dayData.vellayappam > 0 ? `<span style="color:#05c46b;">വെ: ${dayData.vellayappam}</span><br>` : ''}
        ${dayData.idli > 0 ? `<span style="color:#2a5298;">ഇഡ്ഡ: ${dayData.idli}</span>` : ''}
        ${dayData.totalOrders === 0 ? '<span style="color:#cbd5e1;">ഓർഡറില്ല</span>' : ''}
      </div>
    `;

    card.onclick = () => showCalendarDayDetails(dateStr, dayData);
    container.appendChild(card);
  }
}

function showCalendarDayDetails(dateStr, dayData) {
  document.getElementById('calendar-day-detail-panel').style.display = 'block';
  document.getElementById('cal-selected-date-title').innerText = `${dateStr} ലെ ഓർഡർ വിവരങ്ങൾ`;
  document.getElementById('cal-day-idiyappam').innerText = dayData.idiyappam;
  document.getElementById('cal-day-vellayappam').innerText = dayData.vellayappam;
  document.getElementById('cal-day-idli').innerText = dayData.idli;

  const tbody = document.querySelector('#calendar-day-orders-table tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!dayData.orders || dayData.orders.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #94a3b8;">ഈ തിയ്യതിയിൽ ഓർഡറുകൾ ലഭ്യമല്ല.</td></tr>';
    return;
  }

  dayData.orders.forEach(o => {
    const row = `<tr>
      <td><strong>${o.storeId}</strong></td>
      <td>${o.storeName}</td>
      <td>${o.route}</td>
      <td>${o.idiyappam}</td>
      <td>${o.vellayappam}</td>
      <td>${o.idli}</td>
    </tr>`;
    tbody.innerHTML += row;
  });

  document.getElementById('calendar-day-detail-panel').scrollIntoView({ behavior: 'smooth' });
}

function fetchProductionMetrics() {
  const prodFilterEl = document.getElementById('production-date-filter');
  const selectedDate = prodFilterEl ? prodFilterEl.value : new Date().toISOString().split('T')[0];

  callCompanyGAS('getDashboardMetrics', { selectedDate: selectedDate }, res => {
    if (res.success) {
      currentMetricsData = res;

      document.getElementById('total-idiyappam').innerText = res.totals.idiyappam;
      document.getElementById('total-vellayappam').innerText = res.totals.vellayappam;
      document.getElementById('total-idli').innerText = res.totals.idli;

      document.getElementById('acc-total-revenue').innerText = `₹${res.totals.totalRevenue.toFixed(2)}`;
      document.getElementById('acc-total-collected').innerText = `₹${res.totals.totalCollected.toFixed(2)}`;
      document.getElementById('acc-total-pending').innerText = `₹${res.totals.totalPending.toFixed(2)}`;

      renderPacketPills('idiyappam-packets-list', res.idiyappamPackets);
      renderPacketPills('vellayappam-packets-list', res.vellayappamPackets);
      renderPacketPills('idli-packets-list', res.idliPackets);

      const tbody = document.querySelector('#route-table tbody');
      if (tbody) {
        tbody.innerHTML = '';
        for (let route in res.routeSummary) {
          const row = `<tr>
            <td><strong>${route}</strong></td>
            <td>${res.routeSummary[route].idiyappam}</td>
            <td>${res.routeSummary[route].vellayappam}</td>
            <td>${res.routeSummary[route].idli}</td>
          </tr>`;
          tbody.innerHTML += row;
        }
      }

      const currentFilter = document.getElementById('delivery-route-filter') ? document.getElementById('delivery-route-filter').value : 'ALL';
      renderDeliveryTable(res.deliveryList, currentFilter);
      renderAccountsLedger(res.accountsLedger);
      renderMonthlyCalendar();
    }
  });
}

function shareSingleItemWhatsApp(itemKey) {
  if (!currentMetricsData) return;

  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n`;
  let packetsObj = {};
  let totalQty = 0;
  let itemNameMalayalam = "";

  if (itemKey === 'idiyappam') {
    itemNameMalayalam = "ഇടിയപ്പം";
    packetsObj = currentMetricsData.idiyappamPackets;
    totalQty = currentMetricsData.totals.idiyappam;
  } else if (itemKey === 'vellayappam') {
    itemNameMalayalam = "വെള്ളയപ്പം";
    packetsObj = currentMetricsData.vellayappamPackets;
    totalQty = currentMetricsData.totals.vellayappam;
  } else if (itemKey === 'idli') {
    itemNameMalayalam = "ഇഡ്ഡലി";
    packetsObj = currentMetricsData.idliPackets;
    totalQty = currentMetricsData.totals.idli;
  }

  msg += `*${itemNameMalayalam} പാക്കിംഗ് വിവരങ്ങൾ*\n`;
  msg += `*തിയ്യതി: ${currentMetricsData.selectedDate}*\n`;
  msg += `------------------------------------\n\n`;

  msg += `*ആകെ ആവിശ്യമുള്ളത്: ${totalQty} എണ്ണം*\n\n`;
  msg += `*പാക്കിംഗ് കണക്കുകൾ:*\n`;

  let hasPackets = false;
  for (let qty in packetsObj) {
    hasPackets = true;
    msg += `  - ${qty} എണ്ണത്തിന്റെ പാക്കറ്റ്: ${packetsObj[qty]} എണ്ണം\n`;
  }

  if (!hasPackets) {
    msg += `  (ഈ തിയ്യതിയിൽ ഓർഡറുകൾ ഇല്ല)\n`;
  }

  const encodedMsg = encodeURIComponent(msg);
  window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

function shareProductionToWhatsApp() {
  if (!currentMetricsData) return;

  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n`;
  msg += `*പ്രൊഡക്ഷൻ & പാക്കിംഗ് വിവരങ്ങൾ*\n`;
  msg += `*തിയ്യതി: ${currentMetricsData.selectedDate}*\n`;
  msg += `------------------------------------\n\n`;

  msg += `*ആകെ വിവരങ്ങൾ:*\n`;
  msg += `• ഇടിയപ്പം: ${currentMetricsData.totals.idiyappam}\n`;
  msg += `• വെള്ളയപ്പം: ${currentMetricsData.totals.vellayappam}\n`;
  msg += `• ഇഡ്ഡലി: ${currentMetricsData.totals.idli}\n\n`;

  msg += `*പാക്കിംഗ് കണക്കുകൾ:*\n`;
  
  msg += `ഇടിയപ്പം:\n`;
  for (let qty in currentMetricsData.idiyappamPackets) {
    msg += `  - ${qty} എണ്ണത്തിന്റെ പാക്കറ്റ്: ${currentMetricsData.idiyappamPackets[qty]} എണ്ണം\n`;
  }
  
  msg += `വെള്ളയപ്പം:\n`;
  for (let qty in currentMetricsData.vellayappamPackets) {
    msg += `  - ${qty} എണ്ണത്തിന്റെ പാക്കറ്റ്: ${currentMetricsData.vellayappamPackets[qty]} എണ്ണം\n`;
  }

  msg += `ഇഡ്ഡലി:\n`;
  for (let qty in currentMetricsData.idliPackets) {
    msg += `  - ${qty} എണ്ണത്തിന്റെ പാക്കറ്റ്: ${currentMetricsData.idliPackets[qty]} എണ്ണം\n`;
  }

  msg += `\n*റൂട്ട് തിരിച്ചുള്ള എണ്ണം:*\n`;
  for (let route in currentMetricsData.routeSummary) {
    msg += `[${route}] -> ഇടിയപ്പം: ${currentMetricsData.routeSummary[route].idiyappam} | വെള്ളയപ്പം: ${currentMetricsData.routeSummary[route].vellayappam} | ഇഡ്ഡലി: ${currentMetricsData.routeSummary[route].idli}\n`;
  }

  const encodedMsg = encodeURIComponent(msg);
  window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

function shareDeliveryToWhatsApp() {
  if (!currentMetricsData || !currentMetricsData.deliveryList) return;

  const selectedRoute = document.getElementById('delivery-route-filter').value;
  let filteredList = currentMetricsData.deliveryList;

  if (selectedRoute !== 'ALL') {
    filteredList = currentMetricsData.deliveryList.filter(item => item.route === selectedRoute);
  }

  let msg = `*മലബാർ ഇടിയപ്പം കമ്പനി*\n`;
  msg += `*കടകളുടെ ഡെലിവറി ഷീറ്റ്*\n`;
  msg += `*തിയ്യതി: ${currentMetricsData.selectedDate}*\n`;
  if (selectedRoute !== 'ALL') {
    msg += `*റൂട്ട്: ${selectedRoute}*\n`;
  }
  msg += `------------------------------------\n\n`;

  if (filteredList.length === 0) {
    msg += `ഈ റൂട്ടിൽ ഡെലിവറി ഓർഡറുകൾ ഇല്ല.\n`;
  } else {
    filteredList.forEach((item, index) => {
      msg += `${index + 1}. *${item.storeName}* (കട നമ്പർ: ${item.storeId})\n`;
      msg += `   ഷിഫ്റ്റ്: ${item.route}\n`;
      msg += `   സാധനങ്ങൾ: ഇടിയപ്പം: ${item.idiyappam} | വെള്ളയപ്പം: ${item.vellayappam} | ഇഡ്ഡലി: ${item.idli}\n`;
      msg += `   ബിൽ തുക: ₹${item.totalAmount.toFixed(2)}\n\n`;
    });
  }

  const encodedMsg = encodeURIComponent(msg);
  window.open(`https://wa.me/?text=${encodedMsg}`, '_blank');
}

function openEditStoreModal(storeId) {
  const store = registeredStoresList.find(s => s.id === storeId);
  if (!store) return;

  document.getElementById('edit-store-id').value = store.id;
  document.getElementById('edit-store-name').value = store.storeName;
  document.getElementById('edit-owner-name').value = store.ownerName;
  document.getElementById('edit-mobile').value = store.mobile;
  document.getElementById('edit-whatsapp').value = store.whatsapp;
  document.getElementById('edit-route').value = store.route;
  document.getElementById('edit-price-idiyappam').value = store.priceIdiyappam;
  document.getElementById('edit-price-vellayappam').value = store.priceVellayappam;
  document.getElementById('edit-price-idli').value = store.priceIdli;

  document.getElementById('edit-store-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-store-modal').classList.remove('active');
}

function submitStoreUpdate() {
  const updatePayload = {
    id: document.getElementById('edit-store-id').value,
    storeName: document.getElementById('edit-store-name').value,
    ownerName: document.getElementById('edit-owner-name').value,
    mobile: document.getElementById('edit-mobile').value,
    whatsapp: document.getElementById('edit-whatsapp').value,
    route: document.getElementById('edit-route').value,
    priceIdiyappam: document.getElementById('edit-price-idiyappam').value,
    priceVellayappam: document.getElementById('edit-price-vellayappam').value,
    priceIdli: document.getElementById('edit-price-idli').value
  };

  callCompanyGAS('updateStore', { storeData: updatePayload }, res => {
    closeEditModal();
    if (res.success) {
      showModal('അപ്ഡേറ്റ് ചെയ്തു', res.message, 'success');
      loadStoreOptions();
    } else {
      showModal('പിശക്', res.message, 'error');
    }
  });
}

function confirmDeleteStore(storeId, storeName) {
  showConfirmModal('കട മായ്ക്കുക', `നിങ്ങൾ കട ${storeId} - ${storeName} ഡിലീറ്റ് ചെയ്യാൻ ഉറപ്പാണോ?`, () => {
    callCompanyGAS('deleteStore', { storeId: storeId }, res => {
      if (res.success) {
        showModal('ഡിലീറ്റ് ചെയ്തു', res.message, 'success');
        loadStoreOptions();
      } else {
        showModal('പിശക്', res.message, 'error');
      }
    });
  });
}

function openEditOrderModal(orderId, idiyappam, vellayappam, idli, route = "Route 1 - Morning") {
  document.getElementById('edit-order-id').value = orderId;
  document.getElementById('edit-order-route').value = route;
  document.getElementById('edit-order-idiyappam').value = idiyappam;
  document.getElementById('edit-order-vellayappam').value = vellayappam;
  document.getElementById('edit-order-idli').value = idli;
  document.getElementById('edit-order-modal').classList.add('active');
}

function closeEditOrderModal() {
  document.getElementById('edit-order-modal').classList.remove('active');
}

function submitOrderUpdate() {
  const payload = {
    orderId: document.getElementById('edit-order-id').value,
    route: document.getElementById('edit-order-route').value,
    idiyappam: document.getElementById('edit-order-idiyappam').value,
    vellayappam: document.getElementById('edit-order-vellayappam').value,
    idli: document.getElementById('edit-order-idli').value
  };

  callCompanyGAS('updateOrder', { orderPayload: payload }, res => {
    closeEditOrderModal();
    if (res.success) {
      showModal('അപ്ഡേറ്റ് ചെയ്തു', res.message, 'success');
      fetchProductionMetrics();
    } else {
      showModal('പിശക്', res.message, 'error');
    }
  });
}

function confirmDeleteOrder(orderId) {
  showConfirmModal('ഓർഡർ മായ്ക്കുക', `നിങ്ങൾ ഈ ഓർഡർ (#${orderId}) ഡിലീറ്റ് ചെയ്യാൻ ഉറപ്പാണോ?`, () => {
    callCompanyGAS('deleteOrder', { orderId: orderId }, res => {
      if (res.success) {
        showModal('ഡിലീറ്റ് ചെയ്തു', res.message, 'success');
        fetchProductionMetrics();
      } else {
        showModal('പിശക്', res.message, 'error');
      }
    });
  });
}

function showModal(title, message, type = 'info') {
  document.getElementById('modal-title').innerText = title;
  document.getElementById('modal-message').innerText = message;
  const iconContainer = document.getElementById('modal-icon-container');
  
  if (type === 'success') {
    iconContainer.innerHTML = '<i class="fa-solid fa-circle-check modal-icon success"></i>';
  } else if (type === 'error') {
    iconContainer.innerHTML = '<i class="fa-solid fa-circle-exclamation modal-icon error"></i>';
  } else {
    iconContainer.innerHTML = '<i class="fa-solid fa-circle-info modal-icon" style="color: var(--color-info);"></i>';
  }

  document.getElementById('custom-modal').classList.add('active');
}

function closeModal() {
  document.getElementById('custom-modal').classList.remove('active');
}

function confirmFormSubmit(formId, confirmMsg) {
  const form = document.getElementById(formId);
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  showConfirmModal('സേവ് ചെയ്യുക', confirmMsg, () => {
    const event = new Event('submit', { cancelable: true });
    form.dispatchEvent(event);
  });
}

function confirmActionModal(message, actionFunction) {
  showConfirmModal('ഉറപ്പാക്കുക', message, actionFunction);
}

function showConfirmModal(title, message, onConfirm) {
  document.getElementById('confirm-title').innerText = title;
  document.getElementById('confirm-message').innerText = message;
  pendingConfirmAction = onConfirm;
  
  document.getElementById('confirm-action-btn').onclick = () => {
    if (pendingConfirmAction) pendingConfirmAction();
    closeConfirmModal();
  };

  document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('active');
}

document.getElementById('login-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;

  callCompanyGAS('authenticateUser', { credentials: { username, password } }, res => {
    if (res.success) {
      localStorage.setItem('snec_authenticated_user', JSON.stringify(res.user));
      checkSessionState();
    } else {
      showModal('ലോഗിൻ പരാജയപ്പെട്ടു', res.message, 'error');
    }
  }, err => showModal('പിശക്', err.toString(), 'error'));
});

document.getElementById('order-form').addEventListener('submit', function(e) {
  e.preventDefault();

  if (isSubmittingOrder) return;

  const storeId = document.getElementById('selected-store-id').value;
  const selectedStore = registeredStoresList.find(s => s.id === storeId);

  if (!selectedStore) {
    showModal('ശ്രദ്ധിക്കുക', 'കട നൽകിയിട്ടുള്ള ലിസ്റ്റിൽ നിന്ന് തിരഞ്ഞെടുക്കുക.', 'error');
    return;
  }
  
  const payload = {
    storeId: selectedStore.id,
    storeName: selectedStore.storeName,
    route: document.getElementById('order-route').value,
    deliveryDate: document.getElementById('order-delivery-date').value,
    idiyappam: document.getElementById('qty-idiyappam').value,
    vellayappam: document.getElementById('qty-vellayappam').value,
    idli: document.getElementById('qty-idli').value
  };

  isSubmittingOrder = true;
  const submitBtn = document.getElementById('submit-order-btn');
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> സേവ് ചെയ്യുന്നു...';

  callCompanyGAS('submitOrder', { orderPayload: payload }, res => {
    isSubmittingOrder = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ഓർഡർ നൽകുക';

    if (res.success) {
      showModal('ഓർഡർ സമർപ്പിച്ചു', res.message, 'success');
      
      const lastDate = document.getElementById('order-delivery-date').value;
      document.getElementById('order-form').reset();
      document.getElementById('selected-store-id').value = '';
      document.getElementById('order-delivery-date').value = lastDate;
      
      fetchProductionMetrics();
    } else {
      showModal('സമർപ്പണം പരാജയപ്പെട്ടു', res.message, 'error');
    }
  }, err => {
    isSubmittingOrder = false;
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ഓർഡർ നൽകുക';
    showModal('പിശക്', err.toString(), 'error');
  });
});

document.getElementById('store-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const storeData = {
    storeName: document.getElementById('reg-store-name').value,
    ownerName: document.getElementById('reg-owner-name').value,
    mobile: document.getElementById('reg-mobile').value,
    whatsapp: document.getElementById('reg-whatsapp').value,
    route: document.getElementById('reg-route').value,
    priceIdiyappam: document.getElementById('reg-price-idiyappam').value,
    priceVellayappam: document.getElementById('reg-price-vellayappam').value,
    priceIdli: document.getElementById('reg-price-idli').value
  };

  callCompanyGAS('registerStore', { storeData: storeData }, res => {
    if (res.success) {
      showModal('കട രജിസ്റ്റർ ചെയ്തു', res.message, 'success');
      document.getElementById('store-form').reset();
      loadStoreOptions();
    } else {
      showModal('രജിസ്ട്രേഷൻ പിശക്', res.message, 'error');
    }
  });
});

document.getElementById('settings-form').addEventListener('submit', function(e) {
  e.preventDefault();
  const settings = {
    sheetId: document.getElementById('set-sheet-id').value,
    appTitle: document.getElementById('set-app-title').value
  };

  callCompanyGAS('saveSystemSettings', { settings: settings }, res => {
    if (res.success) {
      showModal('സെറ്റിംഗ്സ് സേവ് ചെയ്തു', res.message, 'success');
    } else {
      showModal('പിശക്', res.message, 'error');
    }
  });
});

function renderPacketPills(containerId, packetObject) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  const keys = Object.keys(packetObject);
  if (keys.length === 0) {
    container.innerHTML = '<span style="color: #94a3b8;">ഓർഡറുകൾ ഇല്ല</span>';
    return;
  }
  keys.forEach(qty => {
    const count = packetObject[qty];
    const pill = `<div class="packet-badge">${qty} എണ്ണം &times; ${count} പാക്കറ്റ്</div>`;
    container.innerHTML += pill;
  });
}
