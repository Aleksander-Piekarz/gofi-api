const jwt = require("jsonwebtoken");

function auth(required = true) {
  return (req, res, next) => {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return required ? res.status(401).json({ error: "Brak tokenu" }) : next();
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      req.user = {
        id: payload.sub,
        role: payload.role,
        email: payload.email,
        username: payload.username,
      };
      next();
    } catch (e) {
      return res.status(401).json({ error: "Nieprawidłowy token" });
    }
  };
}

module.exports = { auth };
