import NdaApp from "./NdaApp";

export default function Home() {
  return (
    // On wide screens the page fills the window exactly and each pane scrolls on its own.
    // flex-none stops it growing to fit its content; printing drops the limit so the whole document prints.
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-6 py-8 lg:h-dvh lg:flex-none lg:py-6 print:h-auto print:p-0">
      <NdaApp />
    </main>
  );
}
