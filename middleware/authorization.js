const jwt = require('jsonwebtoken');

const authorization = (req, res, next) => {
    if (!req.headers.authorization) {
        next();
    } else {
        if (/^Bearer /.test(req.headers.authorization)) {
            const token = req.headers.authorization.replace(/^Bearer /, "");

            try {
                // https://stackoverflow.com/questions/68024844/how-can-get-the-property-from-result-of-jwt-verify-method-that-was-already-cre
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                req.email = decoded.email;
                next();
            } catch (e) {
                if (e.name === "TokenExpiredError") {
                    res.status(401).json({ error: true, message: "JWT token has expired" });
                } else {
                    res.status(401).json({ error: true, message: "Invalid JWT token" });
                }
            }
        } else {
            res.status(401).json({ error: true, message: "Authorization header is malformed" });
        }
    }
};

module.exports = authorization;