import { advanceToNextItem } from './inventory.js';

export function renderOrderSummaryList(searchTerm = '') {
    el.orderSummaryList.innerHTML = '';
    if (!state.currentOrder) return;

    const orderForDate = new Date(state.currentOrder.orderForDate);
    orderForDate.setMinutes(orderForDate.getMinutes() + orderForDate.getTimezoneOffset());
    el.orderSummaryTitle.textContent = `Pedido para: ${orderForDate.toLocaleDateString('es-AR')}`;

    const filteredItems = state.currentOrder.items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filteredItems.forEach((item) => {
        const index = state.currentOrder.items.indexOf(item);
        const listItem = document.createElement('div');
        listItem.className = 'grid grid-cols-3 gap-2 items-center bg-gray-700 p-3 rounded-lg';
        listItem.innerHTML = `
            <span>${item.name}</span>
            <div class="text-right bg-gray-600 p-2 rounded-md">${item.toOrder === null ? '---' : item.toOrder}</div>
            <input type="number" step="0.01" value="${item.received ?? item.toOrder ?? ''}" data-index="${index}" class="w-full bg-gray-600 text-white text-center p-2 rounded-md border border-gray-500">
        `;
        el.orderSummaryList.appendChild(listItem);
    });
}

export function renderEditOrderView(orderId) {
    editingId = orderId;
    const order = state.history.find(h => h.id == orderId);
    if (!order) return;

    const orderForDate = new Date(order.orderForDate);
    orderForDate.setMinutes(orderForDate.getMinutes() + orderForDate.getTimezoneOffset());
    el.editOrderTitle.textContent = `Editar Pedido para: ${orderForDate.toLocaleDateString('es-AR')}`;
    el.editOrderList.innerHTML = '';

    const header = `<div class="grid grid-cols-3 gap-2 font-bold text-gray-400 px-3 pb-2 border-b border-gray-600"><span>Ítem</span><span class="text-right">Pedido</span><span class="text-right">Recibido</span></div>`;
    el.editOrderList.innerHTML = header;

    order.items.forEach((item, index) => {
        if (item.toOrder !== null && item.toOrder !== 'NO PEDIR') {
            const listItem = document.createElement('div');
            listItem.className = 'grid grid-cols-3 gap-2 items-center bg-gray-700 p-3 rounded-lg';
            listItem.innerHTML = `
                <span>${item.name}</span>
                <div class="text-right bg-gray-600 p-2 rounded-md">${item.toOrder}</div>
                <input type="number" step="0.01" value="${item.received ?? item.toOrder}" data-index="${index}" class="w-full bg-gray-600 text-white text-center p-2 rounded-md border border-gray-500">
            `;
            el.editOrderList.appendChild(listItem);
        }
    });
    switchView(el.editOrder);
}

export function renderRemitoConfirmView(detectedItems) {
    const baseInv = state.history.find(h => h.id === tempBaseInventoryId);
    if (!baseInv) {
        alert("Error: No se pudo encontrar el inventario base.");
        return;
    }

    tempRemitoItems = [];
    const uniqueItemsFound = new Set();

    if (!Array.isArray(detectedItems)) {
        console.error("'detectedItems' NO es un array. Deteniendo la ejecución.", detectedItems);
        alert("El resultado del análisis no es una lista válida. Revisa la consola de desarrollador (F12).");
        return;
    }

    detectedItems.forEach(detected => {
        let bestMatch = null;
        let highestScore = 0;
        state.masterItems.forEach(masterItem => {
            const score = stringSimilarity(detected.item.toUpperCase(), masterItem.toUpperCase());
            if (score > highestScore && score > 0.7) {
                highestScore = score;
                bestMatch = masterItem;
            }
        });

        if (bestMatch && !uniqueItemsFound.has(bestMatch)) {
            tempRemitoItems.push({ name: bestMatch, quantity: detected.quantity });
            uniqueItemsFound.add(bestMatch);
        }
    });

    displayRemitoConfirmList();
    switchView(el.remitoConfirmView);
}

export function displayRemitoConfirmList() {
    el.remitoConfirmList.innerHTML = '';

    tempRemitoItems.forEach(item => {
        const listItem = document.createElement('div');
        listItem.className = 'flex items-center justify-between bg-gray-700 p-3 rounded-lg gap-2';

        const quantityValue = item.quantity ?? '';

        listItem.innerHTML = `
            <span class="flex-1 text-gray-200">${item.name}</span>
            <input type="number" step="0.01" value="${quantityValue}" data-item-name="${item.name}" class="remito-quantity-input w-24 bg-gray-600 text-white text-center p-2 rounded-md border border-gray-500">
            <button data-item-name="${item.name}" class="delete-remito-item-btn bg-red-600 hover:bg-red-500 text-white font-bold w-10 h-10 flex items-center justify-center rounded-lg">&times;</button>
        `;
        el.remitoConfirmList.appendChild(listItem);
    });

    el.remitoConfirmList.querySelectorAll('.remito-quantity-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const itemName = e.target.dataset.itemName;
            const newQuantity = parseFloat(e.target.value) || 0;
            const itemIndex = tempRemitoItems.findIndex(i => i.name === itemName);
            if (itemIndex !== -1) {
                tempRemitoItems[itemIndex].quantity = newQuantity;
            }
            updateRemitoSummaryFooter();
        });
    });

    el.remitoConfirmList.querySelectorAll('.delete-remito-item-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemName = e.target.dataset.itemName;
            tempRemitoItems = tempRemitoItems.filter(i => i.name !== itemName);
            displayRemitoConfirmList();
        });
    });

    updateAddItemDropdown();
    updateRemitoSummaryFooter();
}

function updateRemitoSummaryFooter() {
    const itemCount = tempRemitoItems.length;
    const bultoCount = tempRemitoItems.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0);

    el.remitoItemCount.textContent = itemCount;
    el.remitoBultoCount.textContent = bultoCount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateAddItemDropdown() {
    const currentItemNames = new Set(tempRemitoItems.map(i => i.name));
    const availableItems = state.masterItems.filter(item => !currentItemNames.has(item));

    el.addRemitoItemSelect.innerHTML = '<option value="">Seleccionar ítem...</option>';
    availableItems.sort().forEach(item => {
        el.addRemitoItemSelect.innerHTML += `<option value="${item}">${item}</option>`;
    });
}

export async function handleOrderNext() {
    const rawValue = el.orderItemQuantity.value.replace(',', '.');
    const quantity = rawValue !== '' ? parseFloat(rawValue) : null;
    if (state.currentOrder && state.currentOrder.items[currentIndex]) {
        state.currentOrder.items[currentIndex].toOrder = (quantity !== null && !isNaN(quantity)) ? quantity : null;
    }
    advanceToNextItem('order');
}
