```js
import {renderMooringDashboard} from "./components/MooringDashboard.js";

document.title = "Subsurface Mooring Timeseries";

const mooringOutlineUrl = await FileAttachment("assets/M1-Mooring-outline.svg").url();
const placeholderUrl = await FileAttachment("assets/dm-mooring-placeholder-test.png").url();

const page = document.createElement("div");
page.className = "dashboard-page";
page.append(renderMooringDashboard({outlineUrl: mooringOutlineUrl, placeholderUrl}));
display(page);
```
