import { createWorker } from "tesseract.js";

const convertor = async (img: string) => {
  const worker = await createWorker('eng');
  const { data: { text } } = await worker.recognize(img);
  console.log(text);
  await worker.terminate();
  return text; 
};

export default convertor; 