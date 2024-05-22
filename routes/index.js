var express = require('express');
var router = express.Router();

// Require packages
const swaggerUI = require('swagger-ui-express');
const swaggerDocument = require('../docs/swagger.json');
const authorization = require('../middleware/authorization'); // Authorization middleware

// Set up Swagger docs at index (https://localhost:3000/)
router.use('/', swaggerUI.serve);
router.get('/', swaggerUI.setup(swaggerDocument));

// Get countries from database
router.get('/countries', function (req, res, next) {
  req.db
    .from("data")
    .select("country")
    .orderBy("country", "asc")
    .distinct("country")
    .then((countriesData) => {
      const countries = countriesData.map((row) => row.country);
      res.status(200).json(countries);
    })
    .catch((err) => {
      console.log(err);
      res.status(400).json({
        error: true,
        message: "Invalid query parameters. Query parameters are not permitted."
      })
    });
});

// Get volcanoes from queried country from database
router.get('/volcanoes', function (req, res, next) {
  const country = req.query.country;
  const popWithin = req.query.populatedWithin;
  const queries = Object.keys(req.query);
  const validQueries = ['country', 'populatedWithin'];
  const validPopWithin = ['5km', '10km', '30km', '100km'];

  const queryVolcanoes = req.db.from("data").select("id", "name", "country", "region", "subregion");

  // Check if queries are valid, adapted from
  // https://stackoverflow.com/questions/8217419/how-to-determine-if-a-javascript-array-contains-an-object-with-an-attribute-that
  if (queries.some(query => !validQueries.includes(query))) {
    res.status(400).json({
      error: true, message: "Invalid query parameters. Only country and populatedWithin are permitted."
    });
  } else if (!country) { // Country not queried
    res.status(400).json({ error: true, message: "Invalid query parameters. Country is a required parameter." })
  } else if (country && !popWithin) { // Populated within not queried
    queryVolcanoes
      .where("country", "=", country)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (country && (validPopWithin.includes(popWithin))) { // Both country and valid populated within queried
    queryVolcanoes
      .where("country", "=", country)
      .where(`population_${popWithin}`, ">", 0)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (!validPopWithin.includes(popWithin)) { // Invalid populated within queried
    res.status(400).json({ error: true, message: "Invalid value for populatedWithin. Only: 5km,10km,30km,100km are permitted." })
  }
});

// Get volcano details by ID
router.get('/volcano/:id', authorization, function (req, res, next) {
  const queries = Object.keys(req.query);

  // If no authorization headers in the request sent
  if (!req.headers.authorization) {
    if (queries.length === 0) { // If no queries requested, query the database
      req.db
        .from("data")
        .select("id", "name", "country", "region", "subregion", "last_eruption", "summit",
          "elevation", "latitude", "longitude")
        .where("id", "=", req.params.id)
        .then((volcano) => {
          if (volcano.length > 0) {
            res.status(200).json(volcano[0]); // Return volcano if found
          } else {
            res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
          }
        })
    } else { // If queries requested, return 400 error
      res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
    }
  }
  else {
    if (queries.length === 0) {
      req.db
        .from("data")
        .select("id", "name", "country", "region", "subregion", "last_eruption", "summit",
          "elevation", "latitude", "longitude", "population_5km",
          "population_10km", "population_30km", "population_100km")
        .where("id", "=", req.params.id)
        .then((volcano) => {
          if (volcano.length > 0) {
            res.status(200).json(volcano[0]);
          } else {
            res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
          }
        })
    } else {
      res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
    }
  }
});

// Get volcano ratings by ID
router.get('/volcano/:id/ratings', function (req, res, next) {
  const id = req.params.id;
  const queries = Object.keys(req.query);

  if (queries.length === 0) {
    const queryVolcano = req.db.from("data").select("ratings").where("id", "=", id);

    queryVolcano.then(volcano => {
      if (volcano.length === 0) {
        res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
      } else {
        const reviews = volcano[0].ratings;
        if (!reviews) {
          res.status(200).json({ averageRating: null, reviews: null }); // If no reviews yet, return object with null fields
        } else {
          const ratings = reviews.filter(review => review.rating).map(review => parseInt(review.rating)); // Parse reviews ratings as ints
          const sumRatings = ratings.reduce((sum, a) => sum + a, 0); // Adapted from https://stackoverflow.com/questions/1230233/how-to-find-the-sum-of-an-array-of-numbers
          const averageRating = sumRatings / reviews.length; // Calculate average rating of the queried volcano

          const reviewsInfo = {
            averageRating: averageRating,
            reviews: reviews
          }

          res.status(200).json(reviewsInfo)
        }
      }
    })
  } else {
    res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
  }
});

// Post reviews (ratings and comments) of queried volcano
router.post('/volcano/:id/ratings', authorization, function (req, res, next) {
  const id = req.params.id;
  const rating = req.body.rating;
  const comment = req.body.comment;
  const queries = Object.keys(req.query);

  // If no rating given, return 400 error
  if (!rating) {
    res.status(400).json({ error: true, message: "Request body incomplete: Rating is required." });
    return;
  } else if ((rating < 0) || (rating > 5) || isNaN(rating)) { // Check that rating is a number between 0 and 5, inclusive
    res.status(400).json({ error: true, message: "Request body invalid: Rating must be a number between 0 and 5 (inclusive)." });
    return;
  }

  // If no authorization headers, return 401 error
  if (!req.headers.authorization) {
    res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" })
  } else {
    if (queries.length === 0) {
      const newRating = {
        date: new Date().toDateString(), // Get current date without time, adapted from https://stackoverflow.com/questions/34722862/how-to-remove-time-part-from-date
        email: req.email, // Get user email from request (decoded in middleware\authorization.js)
        rating: rating,
        comment: comment
      }

      const queryVolcano = req.db.from("data").where("id", "=", id);
      queryVolcano.then(volcano => {
        if (volcano.length === 0) {
          throw new Error(`Volcano with ID: ${req.params.id} not found.`)
        }
        const currentRatings = !volcano[0].ratings ? [] : (volcano[0].ratings); // Get existing ratings, create new ratings array if none
        currentRatings.push(newRating); // Add user review to ratings array
        return queryVolcano.update({ ratings: JSON.stringify(currentRatings) }).then(() => currentRatings); // Update ratings in database, then return updated ratings
      }).then((ratings) => {
        res.status(200).json(ratings); // Return 200 status with updated ratings
      }).catch((err) => {
        if (err.message === `Volcano with ID: ${req.params.id} not found.`) {
          res.status(404).json({ error: true, message: err.message })
        }
      });
    } else {
      res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
    }
  }
});

// Get student details
router.get('/me', function (req, res, next) {
  res.status(200).json({
    name: "Ryan Indrananda",
    student_number: "n10852565"
  });
  return;
});

module.exports = router;
