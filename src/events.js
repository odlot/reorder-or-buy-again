export function bindAppEvents({
  dom,
  state,
  validViews,
  clampQuantity,
  render,
  persistAndRender,
  setSettingsNotice,
  addSourceCategoryPreset,
  addRoomPreset,
  removeSourceCategoryPreset,
  removeRoomPreset,
  addItemFromQuickForm,
  exportBackup,
  importBackupFile,
  resetLocalData,
  linkSyncFile,
  syncWithLinkedFile,
  clearSyncLink,
  decodeItemId,
  setQuantity,
  confirmItemCheck,
  deleteItemById,
  startEditingItemById,
  cancelEditingItem,
  saveItemEdits,
  setShoppingBuyQuantity,
  stepShoppingBuyQuantity,
  commitShoppingBuyFromInput,
  applyPurchasedItems,
  copyShoppingList,
  shareShoppingList,
  commitQuantityFromInput,
  undoDelete,
  onStorageStateChange,
  updateViewportOffsetBottom,
  setAllSourceFilter,
  setAllStatusFilter,
  setAllRoomFilter,
  setShoppingSourceFilter,
  confirmAllDueChecks,
}) {
  const {
    searchInput,
    allSourceFilterInput,
    allRoomFilterInput,
    statusFilterAllButton,
    statusFilterDueButton,
    defaultThresholdInput,
    defaultCheckIntervalInput,
    themeModeInput,
    sourceCategoryPresetForm,
    sourceCategoryPresetInput,
    sourceCategoryPresetList,
    roomPresetForm,
    roomPresetInput,
    roomPresetList,
    quickAddForm,
    viewDueItemsButton,
    confirmAllDueButton,
    shoppingSourceFilterInput,
    exportDataButton,
    importDataButton,
    importDataInput,
    resetDataButton,
    linkSyncButton,
    syncNowButton,
    clearSyncLinkButton,
    navTabs,
    itemList,
    shoppingList,
    copyShoppingButton,
    shareShoppingButton,
    applyPurchasedButton,
    undoButton,
  } = dom;

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  allSourceFilterInput.addEventListener("change", (event) => {
    setAllSourceFilter(event.target.value);
  });

  statusFilterAllButton.addEventListener("click", () => {
    setAllStatusFilter("all");
  });

  statusFilterDueButton.addEventListener("click", () => {
    setAllStatusFilter("due");
  });

  allRoomFilterInput.addEventListener("change", (event) => {
    setAllRoomFilter(event.target.value);
  });

  shoppingSourceFilterInput.addEventListener("change", (event) => {
    setShoppingSourceFilter(event.target.value);
  });

  defaultThresholdInput.addEventListener("change", (event) => {
    state.settings.defaultLowThreshold = clampQuantity(event.target.value);
    setSettingsNotice("Default threshold updated.", "success");
    persistAndRender({ touchUpdatedAt: false });
  });

  defaultCheckIntervalInput.addEventListener("change", (event) => {
    const interval = Math.max(1, clampQuantity(event.target.value));
    state.settings.defaultCheckIntervalDays = interval;
    event.target.value = String(interval);
    setSettingsNotice("Default check interval updated.", "success");
    persistAndRender({ touchUpdatedAt: false });
  });

  if (themeModeInput) {
    themeModeInput.addEventListener("change", (event) => {
      state.settings.themeMode = event.target.value === "dark" ? "dark" : "light";
      setSettingsNotice("Theme updated.", "success");
      persistAndRender({ touchUpdatedAt: false });
    });
  }

  sourceCategoryPresetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = sourceCategoryPresetInput.value;
    sourceCategoryPresetInput.value = "";
    setSettingsNotice("", "");
    addSourceCategoryPreset(value);
  });

  roomPresetForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = roomPresetInput.value;
    roomPresetInput.value = "";
    setSettingsNotice("", "");
    addRoomPreset(value);
  });

  sourceCategoryPresetList.addEventListener("click", (event) => {
    const removeButton = event.target.closest(
      '[data-action="remove-source-category-preset"]'
    );
    if (!removeButton) {
      return;
    }
    const preset = removeButton.dataset.preset;
    removeSourceCategoryPreset(preset);
  });

  roomPresetList.addEventListener("click", (event) => {
    const removeButton = event.target.closest('[data-action="remove-room-preset"]');
    if (!removeButton) {
      return;
    }
    const preset = removeButton.dataset.preset;
    removeRoomPreset(preset);
  });

  quickAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addItemFromQuickForm();
  });

  viewDueItemsButton.addEventListener("click", () => {
    setAllStatusFilter("due");
  });

  confirmAllDueButton.addEventListener("click", () => {
    confirmAllDueChecks();
  });

  exportDataButton.addEventListener("click", () => {
    exportBackup();
  });

  importDataButton.addEventListener("click", () => {
    importDataInput.click();
  });

  importDataInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    await importBackupFile(file);
    event.target.value = "";
  });

  resetDataButton.addEventListener("click", () => {
    resetLocalData();
  });

  linkSyncButton.addEventListener("click", () => {
    void linkSyncFile();
  });

  syncNowButton.addEventListener("click", () => {
    void syncWithLinkedFile();
  });

  applyPurchasedButton.addEventListener("click", () => {
    applyPurchasedItems();
  });

  copyShoppingButton.addEventListener("click", () => {
    void copyShoppingList();
  });

  shareShoppingButton.addEventListener("click", () => {
    void shareShoppingList();
  });

  clearSyncLinkButton.addEventListener("click", () => {
    void clearSyncLink();
  });

  navTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const { view } = tab.dataset;
      if (!view || !validViews.has(view)) {
        return;
      }

      state.activeView = view;
      if (view !== "all") {
        state.editingItemId = "";
      }
      render();
    });
  });

  itemList.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const row = actionTarget.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    const item = state.items.find((entry) => entry.id === itemId);
    if (!item) {
      return;
    }

    const action = actionTarget.dataset.action;

    if (action === "step") {
      const step = Number.parseInt(actionTarget.dataset.step, 10);
      if (Number.isNaN(step)) {
        return;
      }

      setQuantity(itemId, item.quantity + step);
      return;
    }

    if (action === "confirm-check") {
      confirmItemCheck(itemId);
      return;
    }

    if (action === "delete") {
      deleteItemById(itemId);
      return;
    }

    if (action === "edit") {
      startEditingItemById(itemId);
      return;
    }

    if (action === "cancel-edit") {
      cancelEditingItem();
    }
  });

  itemList.addEventListener("submit", (event) => {
    const form = event.target.closest(".item-edit-form");
    if (!form) {
      return;
    }

    event.preventDefault();
    const row = form.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    const formData = new FormData(form);
    saveItemEdits(itemId, {
      name: formData.get("name"),
      lowThreshold: formData.get("lowThreshold"),
      targetQuantity: formData.get("targetQuantity"),
      sourceCategories: formData.getAll("sourceCategories"),
      room: formData.get("room"),
    });
  });

  itemList.addEventListener("focusout", (event) => {
    const input = event.target.closest(".qty-input");
    if (!input) {
      return;
    }

    const row = input.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    commitQuantityFromInput(input, itemId);
    delete input.dataset.previousValue;
  });

  itemList.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && event.target.closest(".item-edit-form")) {
      event.preventDefault();
      cancelEditingItem();
      return;
    }

    const input = event.target.closest(".qty-input");
    if (!input) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      const previous = input.dataset.previousValue;
      if (previous) {
        input.value = previous;
      }
      input.blur();
    }
  });

  itemList.addEventListener("focusin", (event) => {
    const input = event.target.closest(".qty-input");
    if (!input) {
      return;
    }

    input.dataset.previousValue = input.value;
  });

  shoppingList.addEventListener("click", (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const row = actionTarget.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    const action = actionTarget.dataset.action;
    if (action === "shopping-step") {
      const step = Number.parseInt(actionTarget.dataset.step, 10);
      if (Number.isNaN(step)) {
        return;
      }
      stepShoppingBuyQuantity(itemId, step);
      return;
    }

    if (action === "shopping-max") {
      setShoppingBuyQuantity(itemId, Number.MAX_SAFE_INTEGER);
    }
  });

  shoppingList.addEventListener("focusout", (event) => {
    const input = event.target.closest(".shopping-buy-input");
    if (!input) {
      return;
    }

    const row = input.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    commitShoppingBuyFromInput(input, itemId);
    delete input.dataset.previousValue;
  });

  shoppingList.addEventListener("keydown", (event) => {
    const input = event.target.closest(".shopping-buy-input");
    if (!input) {
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      const previous = input.dataset.previousValue;
      if (previous) {
        input.value = previous;
      }
      input.blur();
    }
  });

  shoppingList.addEventListener("focusin", (event) => {
    const input = event.target.closest(".shopping-buy-input");
    if (!input) {
      return;
    }

    input.dataset.previousValue = input.value;
  });

  undoButton.addEventListener("click", () => {
    undoDelete();
  });

  window.addEventListener("storage", onStorageStateChange);
  window.addEventListener("resize", updateViewportOffsetBottom);
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", updateViewportOffsetBottom);
    window.visualViewport.addEventListener("scroll", updateViewportOffsetBottom);
  }
}
