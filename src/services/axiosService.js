import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://localhost:5000/api/",
  // Add any other default configurations here, such as headers, etc.
});

export default axiosInstance;
