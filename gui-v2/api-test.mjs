import fetch from 'node-fetch';

async function test() {
  try {
    const r = await fetch('http://localhost:3000/api/applications');
    const data = await r.json();
    console.log('Applications:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
}
test();
