import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

// jsdom has no layout and no modal dialogs.
Element.prototype.scrollIntoView = () => {};
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
