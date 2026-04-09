import { startChromeContentRuntime } from "./startChromeContentRuntime.js";
import { SimpleContentUi } from "./SimpleContentUi.js";

const ui = new SimpleContentUi();

void startChromeContentRuntime(ui.createCallbacks());
