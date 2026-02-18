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
  restockVisibleLowItems,
  clearSyncLink,
  decodeItemId,
  setQuantity,
  restockItemById,
  deleteItemById,
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
    restockAllButton,
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

  restockAllButton.addEventListener("click", () => {
    restockVisibleLowItems();
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

    if (action === "restock") {
      restockItemById(itemId);
      return;
    }

    if (action === "delete") {
      deleteItemById(itemId);
    }
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
