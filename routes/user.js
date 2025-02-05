// User routing

var express = require('express');
var router = express.Router();

// Require packages
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // JWT secret key
const bcrypt = require('bcrypt');
const authorization = require('../middleware/authorization'); // Authorization middleware

// User login (POST)
router.post('/login', function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;

  // Verify body
  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete, both email and password are required"
    });
    return;
  }

  // Determine if user exists in the table
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers
    .then(users => {
      if (users.length === 0) {
        throw new Error("Incorrect email or password");
      }

      // Compare password hashes
      const user = users[0];
      return bcrypt.compare(password, user.hash);
    })
    .then(match => {
      if (!match) {
        throw new Error("Incorrect email or password");
      }

      // Create and return JWT token
      const expires_in = 60 * 60 * 24; // 24 hours
      const exp = Math.floor(Date.now() / 1000) + expires_in;
      const token = jwt.sign({ email, exp }, JWT_SECRET);
      res.status(200).json({
        token,
        token_type: "Bearer",
        expires_in
      });
    })
    .catch(e => {
      if (e.message === "Incorrect email or password") {
        res.status(401).json({ error: true, message: e.message });
      }
    });
});

// User registration (POST)
router.post('/register', function (req, res, next) {
  const email = req.body.email;
  const password = req.body.password;

  if (!email || !password) {
    res.status(400).json({
      error: true,
      message: "Request body incomplete, both email and password are required"
    });
    return;
  }

  // Throw error if user already exists in database
  const queryUsers = req.db.from("users").select("*").where("email", "=", email);
  queryUsers.then(users => {
    if (users.length > 0) {
      throw new Error("User already exists");
    }

    // Insert user into DB with hashed password
    const saltRounds = 10;
    const hash = bcrypt.hashSync(password, saltRounds);
    return req.db.from("users").insert({ email, hash });
  })
    .then(() => {
      res.status(201).json({ message: "User created" });
    })
    .catch(e => {
      if (e.message === "User already exists") {
        res.status(409).json({ error: true, message: e.message });
      }
    });
});

// Get user profile using email path parameter
router.get('/:email/profile', authorization, function (req, res, next) {
  const email = req.params.email;

  // If no authorization header sent, return user data without dob and address
  if (!req.headers.authorization) {
    const queryUser = req.db.from("users").select("email", "firstName", "lastName").where("email", "=", email);
    queryUser.then(users => {
      if (users.length === 0) {
        throw new Error("User not found");
      } else {
        res.status(200).json(users[0]);
      }
    })
      .catch(e => {
        if (e.message === "User not found") {
          res.status(404).json({ error: true, message: e.message });
        }
      });
  } else {
    if (req.email === email) { // If JWT token user email matches queried email, include dob and address
      const queryUser = req.db.from("users").select("email", "firstName", "lastName", "dob", "address").where("email", "=", email);

      queryUser.then(users => {
        if (users.length === 0) {
          throw new Error("User not found");
        } else {
          res.status(200).json(users[0]);
        }
      })
        .catch(e => {
          if (e.message === "User not found") {
            res.status(404).json({ error: true, message: e.message });
          }
        });
    } else { // If JWT token doesn't match, don't include dob and address
      const queryUser = req.db.from("users").select("email", "firstName", "lastName").where("email", "=", email);

      queryUser.then(users => {
        if (users.length === 0) {
          throw new Error("User not found");
        } else {
          res.status(200).json(users[0]);
        }
      })
        .catch(e => {
          if (e.message === "User not found") {
            res.status(404).json({ error: true, message: e.message });
          }
        });
    }
  }
})

// Update user profile from email path parameter
router.put('/:email/profile', authorization, function (req, res, next) {
  const email = req.params.email;
  const firstName = req.body.firstName;
  const lastName = req.body.lastName;
  const dob = req.body.dob;
  const address = req.body.address;

  // Check that firstName, lastName, and address are strings
  if (typeof firstName !== "string" || typeof lastName !== "string" || typeof address !== "string") {
    if (!firstName || !lastName || !dob || !address) { // Check that request body format is valid
      res.status(400).json({ error: true, message: "Request body incomplete: firstName, lastName, dob and address are required." });
      return;
    }
    res.status(400).json({ error: true, message: "Request body invalid: firstName, lastName and address must be strings only." });
    return;
  }

  // Convert dob to date (will rollover if required), https://www.w3schools.com/js/js_dates.asp
  const testDate = new Date(dob);

  // Convert back to string with correct format, adapted from https://stackoverflow.com/questions/10073699/pad-a-number-with-leading-zeros-in-javascript
  const testedDob = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, '0')}-${String(testDate.getDate()).padStart(2, '0')}`;

  // Check if date is valid - regex match adapted from https://stackoverflow.com/questions/18758772/how-do-i-validate-a-date-in-this-format-yyyy-mm-dd-using-jquery
  if (isNaN(testDate) || !dob.match(/^\d{4}-\d{2}-\d{2}$/) || testDate.getMonth() > 13 || testDate.getDate() > 31 || dob !== testedDob) {
    res.status(400).json({ error: true, message: "Invalid input: dob must be a real date in format YYYY-MM-DD." });
    return;
  } else if (testDate.getTime() > Date.now()) { // Check if date is in the future (invalid)
    res.status(400).json({ error: true, message: "Invalid input: dob must be a date in the past." });
    return;
  }

  // If no authorization header sent, return 401 error
  if (!req.headers.authorization) {
    res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" })
  } else {
    if (req.email !== email) { // If JWT token email does not match path parameter email, return 403 error
      res.status(403).json({ error: true, message: "Forbidden" });
      return;
    }

    // Update user details in database
    const queryUser = req.db.from("users").select("email", "firstName", "lastName", "dob", "address").where("email", "=", email);
    queryUser.update({
      firstName: firstName,
      lastName: lastName,
      dob: testedDob,
      address: address
    })
      .then(() => {
        return req.db.from("users").select("email", "firstName", "lastName", "dob", "address").where("email", "=", email);
      })
      .then((user) => {
        res.status(200).json(user[0]);
      })
  }
});

module.exports = router;
