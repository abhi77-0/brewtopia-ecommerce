const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getDB } = require('./db');

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials. Please check your .env file');
}

passport.serializeUser((user, done) => {
    done(null, user.email);
});

passport.deserializeUser(async (email, done) => {
    try {
        const db = getDB();
        const user = await db.collection('users').findOne({ email });
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const db = getDB();
        const email = profile.emails[0].value;
        
        // Check if user already exists
        let user = await db.collection('users').findOne({ email });
        
        if (user) {
            return done(null, user);
        }

        // If user doesn't exist, create new user
        const newUser = {
            email: email,
            name: profile.displayName,
            googleId: profile.id,
            isGoogleAuth: true,
            createdAt: new Date()
        };

        const result = await db.collection('users').insertOne(newUser);
        newUser._id = result.insertedId;
        return done(null, newUser);
    } catch (error) {
        console.error('Google Auth Error:', error);
        return done(error, null);
    }
})); 