const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getDB } = require('./db');
require('dotenv').config();

if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error('Missing Google OAuth credentials. Please check your .env file');
}

passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: "http://localhost:3004/users/auth/google/callback",
            passReqToCallback: true
        },
        async function(request, accessToken, refreshToken, profile, done) {
            try {
                // Create a standardized user object
                const user = {
                    id: profile.id,
                    displayName: profile.displayName,
                    emails: profile.emails,
                    photos: profile.photos,
                    provider: 'google'
                };
                
                return done(null, user);
            } catch (error) {
                return done(error, null);
            }
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((user, done) => {
    done(null, user);
});

module.exports = passport; 