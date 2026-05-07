import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

async function run() {
  try {
    console.log('KEY:', process.env.GEMINI_API_KEY.substring(0, 8) + '...');
    const result = await model.generateContent('Hello');
    console.log('SUCCESS:', result.response.text());
  } catch (err) {
    console.error('FAILURE:', err.message);
  }
}
run();
