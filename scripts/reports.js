import { renderEditOrderView } from './orders.js';
import { renderEditInventoryView } from './inventory.js';

export function handleDownloadPdf(entry, type) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    if (!entry || !entry.items) return alert('No hay datos para generar el PDF.');

    if (type === 'order') {
        const tableData = entry.items.filter(item => item.toOrder !== null && item.toOrder !== 'NO PEDIR').map(item => [item.name, item.stock, item.toOrder, item.received ?? item.toOrder]);
        if (tableData.length === 0) return alert('No hay items en el pedido para generar el PDF.');
        const orderForDate = new Date(entry.orderForDate);
        orderForDate.setMinutes(orderForDate.getMinutes() + orderForDate.getTimezoneOffset());
        doc.text(`Pedido para el día: ${orderForDate.toLocaleDateString('es-AR')}`, 14, 22);
        doc.autoTable({ head: [['Ítem', 'Stock', 'Pedido', 'Recibido']], body: tableData, startY: 35 });
    } else {
        const countedItems = entry.items.filter(item => item.quantity !== null);
        if (countedItems.length === 0) return alert('No hay items con cantidad para generar el PDF.');
        const tableData = countedItems.map(item => [item.name, item.quantity]);
        const inventoryDate = new Date(entry.date);
        inventoryDate.setMinutes(inventoryDate.getMinutes() + inventoryDate.getTimezoneOffset());
        doc.text("Resumen de Inventario", 14, 22);
        doc.text(`Fecha: ${inventoryDate.toLocaleDateString('es-AR')} - Momento: ${entry.timeOfDay}`, 14, 30);
        doc.autoTable({ head: [['Ítem', 'Cantidad']], body: tableData, startY: 35 });
    }
    const dateStr = new Date().toISOString().split('T')[0];
    doc.save(`documento_${dateStr}.pdf`);
}

export function renderHistoryList(forSelection) {
    const listElement = forSelection ? el.selectInventoryList : el.historyList;
    listElement.innerHTML = '';
    const inventories = state.history.filter(h => h.type === 'inventory').sort((a,b) => new Date(b.date) - new Date(a.date));

    if (inventories.length === 0) {
        listElement.innerHTML = `<p class="text-gray-400 text-center">No hay ${forSelection ? 'inventarios' : 'registros'} guardados.</p>`;
        return;
    }

    inventories.forEach((inv) => {
        const details = document.createElement('details');
        details.className = 'bg-gray-700 rounded-lg';

        const summary = document.createElement('summary');
        summary.className = 'p-3 flex justify-between items-center cursor-pointer';

        const inventoryDate = new Date(inv.date);
        inventoryDate.setMinutes(inventoryDate.getMinutes() + inventoryDate.getTimezoneOffset());

        const buttonsHTML = forSelection
            ? `<button data-id="${inv.id}" class="select-inv-btn bg-green-600 px-3 py-1 rounded-lg text-sm z-10">Seleccionar</button>`
            : `<div class="flex gap-2 z-10">
                   <button data-id="${inv.id}" class="edit-inventory-btn bg-yellow-600 px-3 py-1 rounded-lg text-xs">Editar</button>
                   <button data-id="${inv.id}" class="delete-inventory-btn bg-red-600 px-3 py-1 rounded-lg text-xs">Borrar</button>
               </div>`;

        summary.innerHTML = `
            <div>
                <p class="font-bold">${inventoryDate.toLocaleDateString('es-AR')} <span class="text-sm font-normal text-indigo-400">(${inv.timeOfDay})</span></p>
            </div>
            ${buttonsHTML}
        `;
        details.appendChild(summary);

        const ordersContainer = document.createElement('div');
        ordersContainer.className = 'px-3 pb-3 border-t border-gray-600';

        const relatedOrders = state.history.filter(h => h.type === 'order' && String(h.baseInventoryId) === String(inv.id));

        if (relatedOrders.length > 0) {
            relatedOrders.forEach(order => {
                const orderDate = new Date(order.orderForDate);
                orderDate.setMinutes(orderDate.getMinutes() + orderDate.getTimezoneOffset());
                const orderDiv = document.createElement('div');
                orderDiv.className = 'mt-2 p-2 bg-gray-800 rounded-md flex justify-between items-center';
                orderDiv.innerHTML = `
                    <p class="text-sm">Pedido para: <span class="font-semibold">${orderDate.toLocaleDateString('es-AR')}</span></p>
                    <div class="flex gap-2">
                        <button data-id="${order.id}" class="history-details-btn bg-blue-600 px-3 py-1 rounded-lg text-xs">Ver</button>
                        <button data-id="${order.id}" class="edit-order-btn bg-yellow-600 px-3 py-1 rounded-lg text-xs">Editar</button>
                        <button data-id="${order.id}" class="delete-order-btn bg-red-600 px-3 py-1 rounded-lg text-xs">Borrar</button>
                    </div>
                `;
                ordersContainer.appendChild(orderDiv);
            });
        } else {
            ordersContainer.innerHTML = '<p class="text-sm text-gray-400 mt-2">No hay pedidos para este inventario.</p>';
        }
        details.appendChild(ordersContainer);
        listElement.appendChild(details);
    });

    listElement.querySelectorAll('.select-inv-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            tempBaseInventoryId = e.target.dataset.id;
            if (tempBaseInventoryId) {
                el.orderForDate.value = new Date().toISOString().split('T')[0];
                switchView(el.setupOrder);
            }
        });
    });

    listElement.querySelectorAll('.history-details-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const entryIndex = state.history.findIndex(h => h.id == e.target.dataset.id);
            if (entryIndex !== -1) {
                renderHistoryDetailList(entryIndex);
                switchView(el.historyDetail);
            }
        });
    });

    listElement.querySelectorAll('.edit-order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            renderEditOrderView(e.target.dataset.id);
        });
    });

    listElement.querySelectorAll('.edit-inventory-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            renderEditInventoryView(e.target.dataset.id);
        });
    });

    listElement.querySelectorAll('.delete-inventory-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const invId = e.target.dataset.id;
            el.confirmDeleteTitle.textContent = '¿Eliminar Inventario?';
            el.confirmDeleteMessage.textContent = 'Se eliminará este inventario y todos sus pedidos asociados. Esta acción es irreversible.';
            el.confirmDeleteModal.classList.remove('hidden');
            el.confirmDeleteBtn.onclick = async () => {
                const batch = writeBatch(db);
                const relatedOrders = state.history.filter(h => String(h.baseInventoryId) === String(invId));
                relatedOrders.forEach(order => batch.delete(refs.historyDoc(order.id)));
                batch.delete(refs.historyDoc(invId));
                await batch.commit();

                el.confirmDeleteModal.classList.add('hidden');
                showToast('Inventario y pedidos asociados eliminados.');
            };
        });
    });

    listElement.querySelectorAll('.delete-order-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const orderId = e.target.dataset.id;
            el.confirmDeleteTitle.textContent = '¿Eliminar Pedido?';
            el.confirmDeleteMessage.textContent = 'Este pedido se eliminará permanentemente. Esta acción no se puede deshacer.';
            el.confirmDeleteModal.classList.remove('hidden');
            el.confirmDeleteBtn.onclick = async () => {
                await deleteDoc(refs.historyDoc(orderId));
                el.confirmDeleteModal.classList.add('hidden');
                showToast('Pedido eliminado.');
            };
        });
    });
}

export function renderHistoryDetailList(historyIndex) {
    const entry = state.history[historyIndex];
    if (!entry) return;
    const isOrder = entry.type === 'order';

    let title;
    if (isOrder) {
        const baseInv = state.history.find(h => h.id === entry.baseInventoryId);
        const baseDate = baseInv ? new Date(baseInv.date) : new Date();
        if(baseInv) baseDate.setMinutes(baseDate.getMinutes() + baseDate.getTimezoneOffset());
        const orderFor = new Date(entry.orderForDate);
        orderFor.setMinutes(orderFor.getMinutes() + orderFor.getTimezoneOffset());
        title = `Pedido para ${orderFor.toLocaleDateString('es-AR')} (Base: ${baseInv ? baseDate.toLocaleDateString('es-AR') : 'N/A'})`;
    } else {
        const date = new Date(entry.date);
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
        title = `${date.toLocaleDateString('es-AR')} - ${entry.timeOfDay}`;
    }
    el.historyDetailTitle.textContent = title;
    el.historyDetailList.innerHTML = '';

    let header;
    if (isOrder) {
        header = `<div class="grid grid-cols-4 gap-2 font-bold text-gray-400 px-3 pb-2 border-b border-gray-600"><span>Ítem</span><span class="text-right">Stock</span><span class="text-right">Pedido</span><span class="text-right">Recibido</span></div>`;
    } else {
        header = `<div class="grid grid-cols-2 gap-2 font-bold text-gray-400 px-3 pb-2 border-b border-gray-600"><span>Ítem</span><span class="text-right">Cantidad</span></div>`;
    }
    el.historyDetailList.innerHTML = header;

    entry.items.forEach(item => {
        const quantity = isOrder ? item.toOrder : item.quantity;
        if (quantity !== null && (!isOrder || (quantity !== 'NO PEDIR'))) {
            const listItem = document.createElement('div');
            if(isOrder) {
                listItem.className = 'grid grid-cols-4 gap-2 bg-gray-700 p-3 rounded-lg';
                listItem.innerHTML = `<span>${item.name}</span>
                                      <span class="text-right font-semibold">${item.stock ?? 'N/A'}</span>
                                      <span class="text-right font-semibold">${quantity}</span>
                                      <span class="text-right font-semibold text-green-400">${item.received ?? quantity}</span>`;
            } else {
                listItem.className = 'grid grid-cols-2 gap-2 bg-gray-700 p-3 rounded-lg';
                listItem.innerHTML = `<span>${item.name}</span><span class="text-right font-semibold">${quantity}</span>`;
            }
            el.historyDetailList.appendChild(listItem);
        }
    });
    el.historyDetailPdfBtn.onclick = () => handleDownloadPdf(entry, isOrder ? 'order' : 'inventory');
}

export function renderConsumptionSetup() {
    const inventories = state.history.filter(h => h.type === 'inventory').sort((a,b) => new Date(a.date) - new Date(b.date));
    el.startInventorySelect.innerHTML = '';
    el.endInventorySelect.innerHTML = '';
    inventories.forEach(inv => {
        const date = new Date(inv.date);
        date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
        const option = `<option value="${inv.id}">${date.toLocaleDateString('es-AR')} - ${inv.timeOfDay}</option>`;
        el.startInventorySelect.innerHTML += option;
        el.endInventorySelect.innerHTML += option;
    });
    switchView(el.consumptionSetup);
}

export function renderConsumptionReport() {
    const startId = el.startInventorySelect.value;
    const endId = el.endInventorySelect.value;

    const startInv = state.history.find(h => h.id == startId);
    const endInv = state.history.find(h => h.id == endId);

    if (!startInv || !endInv || new Date(startInv.date) >= new Date(endInv.date)) {
        alert('Asegúrate de seleccionar un inventario inicial y final válidos. La fecha inicial debe ser anterior a la final.');
        return;
    }

    const startDate = new Date(startInv.date);
    const endDate = new Date(endInv.date);

    const receivedOrders = state.history.filter(h =>
        h.type === 'order' &&
        new Date(h.orderForDate) > startDate &&
        new Date(h.orderForDate) <= endDate
    );

    el.consumptionResultList.innerHTML = '';
    const header = `<div class="grid grid-cols-5 gap-2 font-bold text-gray-400 px-3 pb-2 border-b border-gray-600 text-sm sticky-header">
                                    <span class="col-span-2">Ítem</span>
                                    <span class="text-right">Inicial</span>
                                    <span class="text-right">Recibido</span>
                                    <span class="text-right">Final</span>
                                    <span class="text-right">Consumo</span>
                               </div>`;
    el.consumptionResultList.innerHTML = header;

    state.masterItems.forEach(itemName => {
        const startItem = startInv.items.find(i => i.name === itemName);
        const endItem = endInv.items.find(i => i.name === itemName);

        const startStock = parseFloat(startItem?.quantity) || 0;
        const endStock = parseFloat(endItem?.quantity) || 0;

        let receivedStock = 0;
        receivedOrders.forEach(order => {
            const orderItem = order.items.find(i => i.name === itemName);
            if (orderItem) {
                const quantityToAdd = typeof orderItem.received === 'number' ? orderItem.received : (typeof orderItem.toOrder === 'number' ? orderItem.toOrder : 0);
                receivedStock += quantityToAdd;
            }
        });

        const consumption = (startStock + receivedStock) - endStock;

        if (startStock > 0 || endStock > 0 || receivedStock > 0 || consumption !== 0) {
            const listItem = document.createElement('div');
            listItem.className = 'grid grid-cols-5 gap-2 bg-gray-700 p-3 rounded-lg text-sm';
            listItem.innerHTML = `<span class="col-span-2">${itemName}</span>
                                  <span class="text-right">${startStock}</span>
                                  <span class="text-right text-green-400">+${receivedStock}</span>
                                  <span class="text-right">${endStock}</span>
                                  <span class="text-right font-bold text-orange-400">${consumption.toFixed(2)}</span>`;
            el.consumptionResultList.appendChild(listItem);
        }
    });
    switchView(el.consumptionResult);
}
