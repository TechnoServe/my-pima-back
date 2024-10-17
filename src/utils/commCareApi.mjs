import axios from "axios";
import heicConvert from 'heic-convert';

const fetchImage = async (url) => {
  if (!url) return null;

  try {
    // Fetch the image from the URL with authorization
    const response = await axios.get(url, {
      headers: {
        Authorization: `ApiKey ${process.env.COMMCARE_API_KEY}`,
      },
      responseType: 'arraybuffer', // Fetch as binary data
    });

    const resBuffer = Buffer.from(response.data, 'binary'); // Create a Buffer from the response

    // Check if the image is in HEIC format
    const isHEIC = response.headers['content-type'] === 'image/heic';

    let base64encodedData;

    if (isHEIC) {
      // Convert HEIC to JPEG (you can also choose PNG)
      const outputBuffer = await heicConvert({
        buffer: resBuffer, // Pass the buffer of the image
        format: 'JPEG', // Convert to JPEG or PNG
        quality: 1, // Quality from 0 (worst) to 1 (best)
      });

      // Convert the Buffer to base64
      base64encodedData = outputBuffer.toString('base64');
    } else {
      // Handle non-HEIC images (e.g., PNG, JPEG)
      base64encodedData = resBuffer.toString('base64');
    }

    // Return the base64 data with appropriate format
    return `data:image/jpeg;base64,${base64encodedData}`; // You can change to PNG if needed
  } catch (error) {
    console.error('Error fetching image:', error);
    return null;
  }
};

function base64encode(str) {
  // encode binary data to base64 encoded string image and specify the mime type
  const base64data = Buffer.from(str).toString("base64");

  return base64data;
}

export default fetchImage;
