import App from "./App";

export default function Home() {
  return (
    // On wide screens the page fills the window exactly and each pane scrolls on its own.
    // flex-none stops it growing to fit its content; printing drops the limit so the whole document prints.
    <main className="flex w-full flex-1 flex-col lg:h-dvh lg:flex-none print:block print:h-auto">
      <App />
    </main>
  );
}
