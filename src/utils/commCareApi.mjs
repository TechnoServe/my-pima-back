import axios from "axios";

const fetchImage = async (url) => {
  if (!url) return null;

  try {
    console.log("fetchung image")
    // fetch from url with authorization
    const response = await axios.get(url, {
      headers: {
        Authorization: `ApiKey ${process.env.COMMCARE_API_KEY}`,
      },
      responseType: "arraybuffer",
    });

    const resText = await response.data;

    // encode the response to base64
    const base64encodedData = base64encode(resText);

    // Send the base64 data to the frontend
    return `data:image/png;base64,${base64encodedData}`;
  } catch (error) {
    console.log(error);
    console.log("error fetching imges")
    return null;
  }
};

function base64encode(str) {
  // encode binary data to base64 encoded string image and specify the mime type
  const base64data = Buffer.from(str).toString("base64");

  return base64data;
}

export default fetchImage;
