import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('App root not found');
}

app.innerHTML = `
  <main class="shell">
    <section class="card">
      <p class="eyebrow">Camera-controlled workout game</p>
      <h1>Pushup Bird</h1>
      <p class="lede">Move your body. Keep the bird alive.</p>
    </section>
  </main>
`;
