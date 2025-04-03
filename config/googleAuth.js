const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userModel');
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
            scope: ['profile', 'email'],
            passReqToCallback: true
        },
        async function(req, accessToken, refreshToken, profile, done) {
            try {
                console.log("Google strategy executing");
                
                let user = await User.findOne({ googleId: profile.id });

                if (!user) {
                    console.log("Creating new user for Google auth");
                    user = await User.create({
                        googleId: profile.id,
                        name: profile.displayName,
                        email: profile.emails[0].value,
                        picture: profile.photos[0].value,
                        provider: 'google'
                    });
                }
                
                // Check if user is blocked
                if (user.blocked) {
                    console.log('Blocked user attempted to login via Google:', user._id);
                    
                    // Add to global blockedUsers if not already there
                    if (!global.blockedUsers) {
                        global.blockedUsers = [];
                    }
                    
                    const userIdStr = user._id.toString();
                    if (!global.blockedUsers.includes(userIdStr)) {
                        global.blockedUsers.push(userIdStr);
                    }
                    
                    // Instead of returning an error, return the user with a flag
                    user.isBlocked = true;
                    return done(null, user);
                }

                return done(null, user);
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