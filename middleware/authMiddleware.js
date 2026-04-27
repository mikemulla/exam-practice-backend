const jwt = require("jsonwebtoken");

function verifyAdminToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  api.interceptors.response.use(
    (response) => response,

    (error) => {
      if (error.response && error.response.status === 401) {
        // Token expired or invalid

        localStorage.removeItem("adminToken");

        window.location.href = "/admin-login";
      }

      return Promise.reject(error);
    },
  );
}

module.exports = verifyAdminToken;
