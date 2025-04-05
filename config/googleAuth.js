const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');
const crypto = require('crypto');
require('dotenv').config();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials. Please check your .env file');
}

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL,
            scope: ['profile', 'email'],
            passReqToCallback: true
        },
        async function(req, accessToken, refreshToken, profile, done) {
            try {
                console.log("Google strategy executing");
                
                // Check if user already exists
                const existingUser = await User.findOne({ email: profile.emails[0].value });
                
                if (existingUser) {
                    return done(null, existingUser);
                }

                console.log('Creating new user for Google auth');
                
                // Generate a random password for Google users
                const randomPassword = crypto.randomBytes(32).toString('hex');
                
                // Create new user
                const newUser = await User.create({
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    password: randomPassword, // Use the random password
                    googleId: profile.id,
                    isEmailVerified: true, // Since it's Google-authenticated
                    authProvider: 'google',
                    profile: {
                        firstName: profile.name.givenName || '',
                        lastName: profile.name.familyName || '',
                        avatar: profile.photos?.[0]?.value || ''
                    }
                });

                return done(null, newUser);
            } catch (error) {
                console.error("Error in Google strategy:", error);
                return done(error, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

module.exports = passport; 