export function bindAppEvents({
  dom,
  state,
  validViews,
  clampQuantity,
  render,
  persistAndRender,
  setSettingsNotice,
  addItemFromQuickForm,
  exportBackup,
  importBackupFile,
  resetLocalData,
  linkSyncFile,
  syncWithLinkedFile,
  clearSyncLink,
  decodeItemId,
  setQuantity,
  deleteItemById,
  startEditingItemById,
  cancelEditingItem,
  saveItemEdits,
  togglePurchasedByItemId,
  applyPurchasedItems,
  commitQuantityFromInput,
  undoDelete,
  onStorageStateChange,
  updateViewportOffsetBottom,
}) {
  const {
    searchInput,
    defaultThresholdInput,
    themeModeInput,
    quickAddForm,
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
    applyPurchasedButton,
    undoButton,
  } = dom;

  searchInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  defaultThresholdInput.addEventListener("change", (event) => {
    state.settings.defaultLowThreshold = clampQuantity(event.target.value);
    setSettingsNotice("Default threshold updated.", "success");
    persistAndRender();
  });

  if (themeModeInput) {
    themeModeInput.addEventListener("change", (event) => {
      state.settings.themeMode = event.target.value === "dark" ? "dark" : "light";
      setSettingsNotice("Theme updated.", "success");
      persistAndRender();
    });
  }

  quickAddForm.addEventListener("submit", (event) => {
    event.preventDefault();
    addItemFromQuickForm();
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

  shoppingList.addEventListener("change", (event) => {
    const checkbox = event.target.closest('[data-action="toggle-purchased"]');
    if (!checkbox) {
      return;
    }

    const row = checkbox.closest("[data-item-id]");
    if (!row) {
      return;
    }

    const itemId = decodeItemId(row.dataset.itemId);
    if (!itemId) {
      return;
    }

    togglePurchasedByItemId(itemId, checkbox.checked);
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
