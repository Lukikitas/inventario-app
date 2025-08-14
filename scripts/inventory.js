export function renderCurrentItem(mode) {
    const process = mode === 'order' ? state.currentOrder : state.currentInventory;
    if (currentIndex < 0 || !process || currentIndex >= process.items.length) return;
    const item = process.items[currentIndex];

    if (mode === 'order') {
        el.orderItemName.textContent = item.name;
        el.orderItemCounter.textContent = `Ítem ${positionInQueue + 1} de ${itemsToCountQueue.length}`;
        el.orderItemStock.textContent = item.stock ?? 'N/A';
        el.orderItemQuantity.value = (item.toOrder === null || item.toOrder === 'NO PEDIR') ? '' : item.toOrder;
        el.orderItemQuantity.focus();
    } else {
        el.itemName.textContent = item.name;
        el.itemCounter.textContent = `Ítem ${positionInQueue + 1} de ${itemsToCountQueue.length}`;
        el.itemQuantity.value = (item.quantity === null || item.quantity === 'N/A') ? '' : item.quantity;
        el.itemQuantity.focus();
    }
}

export async function advanceToNextItem(mode) {
    positionInQueue++;
    const process = mode === 'order' ? state.currentOrder : state.currentInventory;
    const quantityKey = mode === 'order' ? 'toOrder' : 'quantity';

    if (positionInQueue >= itemsToCountQueue.length) {
        const remainingIndices = process.items
            .map((item, index) => ({ ...item, originalIndex: index }))
            .filter(item => item[quantityKey] === null)
            .map(item => item.originalIndex);

        if (remainingIndices.length > 0) {
            itemsToCountQueue = remainingIndices;
            positionInQueue = 0;
            currentIndex = itemsToCountQueue[0];
            renderCurrentItem(mode);
        } else {
            if (mode === 'order') {
                switchView(el.orderFinished);
            } else {
                switchView(el.finished);
            }
        }
    } else {
        currentIndex = itemsToCountQueue[positionInQueue];
        renderCurrentItem(mode);
    }
    await setDoc(mode === 'order' ? refs.currentOrder() : refs.currentInventory(), process);
}

export function renderSummaryList(searchTerm = '') {
    el.summaryList.innerHTML = '';
    if (!state.currentInventory || !state.currentInventory.items) return;

    const filteredItems = state.currentInventory.items.filter(item =>
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filteredItems.forEach((item) => {
        const index = state.currentInventory.items.indexOf(item);
        const isNA = item.quantity === 'N/A';
        const listItem = document.createElement('div');
        listItem.className = 'flex items-center justify-between bg-gray-700 p-3 rounded-lg';
        const nameSpan = document.createElement('span');
        nameSpan.className = `flex-1 mr-4 ${isNA ? 'text-gray-500 line-through' : 'text-gray-200'}`;
        nameSpan.textContent = item.name;
        listItem.appendChild(nameSpan);
        const controlsWrapper = document.createElement('div');
        controlsWrapper.className = 'flex items-center gap-2';
        const itemInput = document.createElement('input');
        itemInput.type = 'number';
        itemInput.step = '0.01';
        itemInput.value = (item.quantity === null || isNA) ? '' : item.quantity;
        itemInput.placeholder = isNA ? 'N/A' : '---';
        itemInput.disabled = isNA;
        itemInput.className = 'w-24 bg-gray-600 text-white text-center p-2 rounded-md border border-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed';
        itemInput.dataset.index = index;
        itemInput.addEventListener('change', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            const rawValue = e.target.value.replace(',', '.');
            const quantity = rawValue !== '' ? parseFloat(rawValue) : null;
            state.currentInventory.items[idx].quantity = (quantity !== null && !isNaN(quantity)) ? quantity : null;
            setDoc(refs.currentInventory(), state.currentInventory);
        });
        controlsWrapper.appendChild(itemInput);
        if (isNA) {
            const undoBtn = document.createElement('button');
            undoBtn.innerHTML = '&#8634;';
            undoBtn.title = 'Deshacer N/A';
            undoBtn.className = 'bg-blue-600 hover:bg-blue-500 text-white font-bold w-10 h-10 flex items-center justify-center rounded-lg';
            undoBtn.dataset.index = index;
            undoBtn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.dataset.index, 10);
                state.currentInventory.items[idx].quantity = null;
                setDoc(refs.currentInventory(), state.currentInventory);
                renderSummaryList(el.inventorySummarySearch.value);
            });
            controlsWrapper.appendChild(undoBtn);
        }
        listItem.appendChild(controlsWrapper);
        el.summaryList.appendChild(listItem);
    });
}

export function renderEditInventoryView(invId) {
    editingId = invId;
    const inv = state.history.find(h => h.id == invId);
    if (!inv) return;

    const invDate = new Date(inv.date);
    invDate.setMinutes(invDate.getMinutes() + invDate.getTimezoneOffset());
    el.editInventoryTitle.textContent = `Editar: ${invDate.toLocaleDateString('es-AR')} (${inv.timeOfDay})`;
    el.editInventoryList.innerHTML = '';

    inv.items.forEach((item, index) => {
        const listItem = document.createElement('div');
        listItem.className = 'flex items-center justify-between bg-gray-700 p-3 rounded-lg';
        listItem.innerHTML = `
            <span class="flex-1 mr-4">${item.name}</span>
            <input type="number" step="0.01" value="${item.quantity ?? ''}" placeholder="${item.quantity === 'N/A' ? 'N/A' : '---'}" data-index="${index}" class="w-24 bg-gray-600 text-white text-center p-2 rounded-md border border-gray-500">
        `;
        el.editInventoryList.appendChild(listItem);
    });
    switchView(el.editInventory);
}

export function renderManageItemsList(searchTerm = '') {
    el.manageItemsList.innerHTML = '';
    const filteredItems = state.masterItems.filter(name =>
        name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filteredItems.forEach((name, index) => {
        const originalIndex = state.masterItems.indexOf(name);
        const listItem = document.createElement('div');
        listItem.className = 'bg-gray-700 p-3 rounded-lg flex justify-between items-center gap-2';
        listItem.setAttribute('draggable', true);
        listItem.dataset.index = originalIndex;

        const dragHandle = `<span class="drag-handle text-gray-400 cursor-grab">&#x2630;</span>`;

        const nameContainer = document.createElement('div');
        nameContainer.className = 'flex-grow';
        nameContainer.innerHTML = `<span class="item-name-text">${name}</span>
                                   <input type="text" class="item-name-input hidden w-full bg-gray-600 p-1 rounded-md" value="${name}">`;

        const buttonsContainer = document.createElement('div');
        buttonsContainer.className = 'flex gap-2';
        buttonsContainer.innerHTML = `<button data-index="${originalIndex}" class="edit-item-btn bg-yellow-600 px-3 py-1 rounded-lg text-xs">Editar</button>
                                      <button data-index="${originalIndex}" class="save-item-btn hidden bg-green-600 px-3 py-1 rounded-lg text-xs">Guardar</button>
                                      <button data-index="${originalIndex}" class="delete-item-btn bg-red-600 px-3 py-1 rounded-lg text-xs font-bold">&times;</button>`;

        listItem.innerHTML = dragHandle;
        listItem.appendChild(nameContainer);
        listItem.appendChild(buttonsContainer);
        el.manageItemsList.appendChild(listItem);
    });

    el.manageItemsList.querySelectorAll('.edit-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const listItem = e.target.closest('div');
            listItem.querySelector('.item-name-text').classList.add('hidden');
            listItem.querySelector('.item-name-input').classList.remove('hidden');
            listItem.querySelector('.edit-item-btn').classList.add('hidden');
            listItem.querySelector('.save-item-btn').classList.remove('hidden');
        });
    });

    el.manageItemsList.querySelectorAll('.save-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const index = parseInt(e.target.dataset.index, 10);
            const listItem = e.target.closest('div');
            const newName = listItem.querySelector('.item-name-input').value.trim();
            if (newName) {
                state.masterItems[index] = newName;
                renderManageItemsList(el.manageItemsSearch.value);
                showToast('Ítem renombrado.');
            }
        });
    });

    el.manageItemsList.querySelectorAll('.delete-item-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const index = parseInt(e.target.dataset.index, 10);
            state.masterItems.splice(index, 1);
            renderManageItemsList(el.manageItemsSearch.value);
            showToast('Ítem eliminado.');
        });
    });

    el.manageItemsList.querySelectorAll('[draggable="true"]').forEach(item => {
        item.addEventListener('dragstart', e => {
            draggedItemIndex = parseInt(e.target.dataset.index, 10);
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            draggedItemIndex = null;
            el.manageItemsList.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
        });
        item.addEventListener('dragover', e => {
            e.preventDefault();
            el.manageItemsList.querySelectorAll('.drag-over').forEach(i => i.classList.remove('drag-over'));
            e.currentTarget.classList.add('drag-over');
        });
        item.addEventListener('drop', e => {
            e.preventDefault();
            const droppedOnItemIndex = parseInt(e.currentTarget.dataset.index, 10);
            if (draggedItemIndex !== null && draggedItemIndex !== droppedOnItemIndex) {
                const [draggedItem] = state.masterItems.splice(draggedItemIndex, 1);
                state.masterItems.splice(droppedOnItemIndex, 0, draggedItem);
                renderManageItemsList(el.manageItemsSearch.value);
            }
        });
    });
}

export async function handleInventoryNext() {
    const rawValue = el.itemQuantity.value.replace(',', '.');
    const quantity = rawValue !== '' ? parseFloat(rawValue) : null;
    if (state.currentInventory && state.currentInventory.items[currentIndex]) {
        state.currentInventory.items[currentIndex].quantity = (quantity !== null && !isNaN(quantity)) ? quantity : null;
    }
    advanceToNextItem('inventory');
}
