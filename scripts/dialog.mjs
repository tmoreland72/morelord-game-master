export function warnDialog(form, field, message) {
  globalThis.ui?.notifications?.warn(message);
  const target = typeof field === "string" ? form?.querySelector?.(`[name="${field}"]`) : field;
  target?.focus?.();
  return false;
}

export function percentIssue(value, field = "volume") {
  if (String(value ?? "").trim() === "") return {field, message: "Volume must be between 0 and 100."};
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return {field, message: "Volume must be between 0 and 100."};
  return null;
}

function dialogButton(dialog, action) {
  const sources = [dialog.options?.buttons, dialog.buttons];
  for (const buttons of sources) {
    if (!buttons) continue;
    if (Array.isArray(buttons)) {
      const found = buttons.find(button => button?.action === action);
      if (found) return found;
    } else if (buttons[action]) return buttons[action];
  }
  return null;
}

export async function submitDialog(dialog, target, event) {
  event?.preventDefault?.();
  const action = target?.dataset?.action;
  const button = dialogButton(dialog, action);
  const result = await button?.callback?.(event, target, dialog);
  if (result === false) return dialog;
  const value = result ?? button?.action ?? action;
  await dialog.options?.submit?.(value, dialog);
  if (dialog.options?.form?.closeOnSubmit === false) return dialog;
  return dialog.close();
}

function dialogClass() {
  if (dialogClass.Dialog) return dialogClass.Dialog;
  dialogClass.Dialog = class extends foundry.applications.api.DialogV2 {
    async _onSubmit(target, event) {
      return submitDialog(this, target, event);
    }
    async _onRender(context, options) {
      await super._onRender?.(context, options);
      const root = this.element;
      const form = root?.matches?.("form") ? root : root?.querySelector?.("form");
      if (form) form.noValidate = true;
    }
  };
  return dialogClass.Dialog;
}

export async function openDialog({title, content, actions = [["ok", "Save"]], modal = true, id, width = 400, validate, render, classes = ["ml-window"], shellClass = "ml-dialog-shell"} = {}) {
  return dialogClass().wait({
    modal, id, classes, window: {title, resizable: true}, position: {width}, rejectClose: false, render,
    content: `<div><div class="ml-app ml-app-shell ${shellClass}">${content}</div></div>`,
    buttons: actions.map(([action, label], index) => ({
      action, label, default: index === 0,
      callback: async (_event, button) => {
        const data = new FormData(button.form);
        const problem = validate ? await validate(data, button.form) : null;
        if (problem) return warnDialog(button.form, problem.field, problem.message);
        return {action, data};
      }
    }))
  });
}
