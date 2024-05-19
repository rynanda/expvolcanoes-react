var express = require('express');
var router = express.Router();

const swaggerUI = require('swagger-ui-express');
const swaggerDocument = require('../docs/swagger.json');
const jwt = require('jsonwebtoken');
const authorization = require('../middleware/authorization');

router.use('/', swaggerUI.serve);
router.get('/', swaggerUI.setup(swaggerDocument));

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

router.get('/volcanoes', function (req, res, next) {
  const country = req.query.country;
  const popWithin = req.query.populatedWithin;
  const queries = Object.keys(req.query);
  const validQueries = ['country', 'populatedWithin'];
  const validPopWithin = ['5km', '10km', '30km', '100km'];

  const queryVolcanoes = req.db.from("data").select("id", "name", "country", "region", "subregion");

  // https://stackoverflow.com/questions/8217419/how-to-determine-if-a-javascript-array-contains-an-object-with-an-attribute-that
  if (queries.some(query => !validQueries.includes(query))) {
    res.status(400).json({
      error: true, message: "Invalid query parameters. Only country and populatedWithin are permitted."
    });
  } else if (!country && !popWithin) {
    res.status(400).json({ error: true, message: "Invalid query parameters. Country is a required parameter." })
  } else if (country && !popWithin) {
    queryVolcanoes
      .where("country", "=", country)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (country && (validPopWithin.includes(popWithin))) {
    queryVolcanoes
      .where("country", "=", country)
      .where(`population_${popWithin}`, ">", 0)
      .then((volcanoes) => {
        res.status(200).json(volcanoes);
      });
  } else if (!country && popWithin) {
    res.status(400).json({ error: true, message: "Country is a required query parameter." })
  } else if (!validPopWithin.includes(popWithin)) {
    res.status(400).json({ error: true, message: "Invalid value for populatedWithin. Only: 5km,10km,30km,100km are permitted." })
  }
});

router.get('/volcano/:id', authorization, function (req, res, next) {
  const queries = Object.keys(req.query);

  if (!req.headers.authorization) {
    if (queries.length === 0) {
      req.db
        .from("data")
        .select("id", "name", "country", "region", "subregion", "last_eruption", "summit",
          "elevation", "latitude", "longitude")
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

router.get('/volcano/:id/ratings', function (req, res, next) {
  const id = req.params.id;
  const queries = Object.keys(req.query);

  if (queries.length === 0) {

    const queryVolcano = req.db.from("data").select("ratings").where("id", "=", id);

    queryVolcano.then(reviewsData => {
      if (reviewsData.length === 0) {
        res.status(404).json({ error: true, message: `Volcano with ID: ${req.params.id} not found.` });
      } else {
        const reviews = reviewsData[0].ratings;
        if (!reviews) {
          res.status(200).json({ averageRating: null, reviews: null });
        } else {
          const ratings = reviews.filter(review => review.rating).map(review => parseInt(review.rating));
          const sumRatings = ratings.reduce((sum, a) => sum + a, 0); // https://stackoverflow.com/questions/1230233/how-to-find-the-sum-of-an-array-of-numbers
          const averageRating = sumRatings / reviews.length;

          const info = {
            averageRating: averageRating,
            reviews: reviews
          }

          res.status(200).json(info)
        }
      }
    })
  } else {
    res.status(400).json({ error: true, message: "Invalid query parameters. Query parameters are not permitted." })
  }
});

router.put('/volcano/:id/ratings', authorization, function (req, res, next) {
  const id = req.params.id;
  const rating = req.body.rating;
  const comment = req.body.comment;
  const queries = Object.keys(req.query);

  if (!rating && !comment) {
    res.status(400).json({ error: true, message: "Request body incomplete: Either rating or comment is required." });
    return;
  }

  if ((rating < 0) || (rating > 5)) {
    res.status(400).json({ error: true, message: "Request body invalid: Rating must be between 0 and 5 (inclusive)." });
    return;
  }

  if (!req.headers.authorization) {
    res.status(401).json({ error: true, message: "Authorization header ('Bearer token') not found" })
  } else {
    if (queries.length === 0) {
      const newRating = {
        date: new Date().toDateString(), // https://stackoverflow.com/questions/34722862/how-to-remove-time-part-from-date
        email: req.email,
        rating: rating,
        comment: comment
      }

      const queryVolcano = req.db.from("data").where("id", "=", id);
      queryVolcano.then(volcano => {
        if (volcano.length === 0) {
          throw new Error(`Volcano with ID: ${req.params.id} not found.`)
        }
        const currentRatings = !volcano[0].ratings ? [] : (volcano[0].ratings);
        currentRatings.push(newRating);
        return queryVolcano.update({ ratings: JSON.stringify(currentRatings) }).then(() => currentRatings);
      }).then((ratings) => {
        res.status(200).json(ratings);
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

router.get('/me', function (req, res, next) {
  res.status(200).json({
    name: "Ryan Indrananda",
    student_number: "n10852565"
  });
  return;
});

module.exports = router;
