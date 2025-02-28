const validateSignup = (req, res, next) => {
    let { name, email, password } = req.body;
    const errors = [];

    // Name validation
    if (!name || name.trim() === '') {
        errors.push('Name is required');
    } else if (name.length < 2) {
        errors.push('Name must be at least 2 characters long');
    }

    // Email validation
    if (!email) {
        errors.push('Email is required');
    } else {
        // Remove any spaces before checking
        email = email.trim();
        req.body.email = email; // Update the request body with trimmed email
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Please enter a valid email address');
        }
        // Check for any spaces in the email
        if (email.includes(' ')) {
            errors.push('Email cannot contain spaces');
        }
    }

    // Password validation
    if (!password) {
        errors.push('Password is required');
    } else {
        if (password.length < 6) {
            errors.push('Password must be at least 6 characters long');
        }
        if (password.includes(' ')) {
            errors.push('Password cannot contain spaces');
        }
    }

    // Age verification validation
    if (!req.body.ageVerification) {
        errors.push('You must confirm that you are 21 years or older');
    }

    if (errors.length > 0) {
        return res.render('signup', { 
            error: errors.join(', '),
            formData: { name, email } // Preserve form data except password
        });
    }

    next();
};

const validateLogin = (req, res, next) => {
    let { email, password } = req.body;
    const errors = [];

    // Email validation
    if (!email) {
        errors.push('Email is required');
    } else {
        // Remove any spaces before checking
        email = email.trim();
        req.body.email = email; // Update the request body with trimmed email
        
        // Check for minimum length
        if (email.length < 5) { // basic minimum length for an email (a@b.c)
            errors.push('Email is too short');
        }
        
        // Check for valid email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Please enter a valid email address');
        }
        
        // Check for spaces
        if (email.includes(' ')) {
            errors.push('Email cannot contain spaces');
        }

        // Check for valid domain
        if (email.split('@')[1]) {
            const domain = email.split('@')[1];
            if (!domain.includes('.') || domain.endsWith('.') || domain.startsWith('.')) {
                errors.push('Please enter a valid email domain');
            }
        }
    }

    // Password validation
    if (!password) {
        errors.push('Password is required');
    } else {
        // Check for minimum length
        if (password.length < 6) {
            errors.push('Password must be at least 6 characters long');
        }
        
        // Check for spaces
        if (password.includes(' ')) {
            errors.push('Password cannot contain spaces');
        }

        // Check for maximum length to prevent long password attacks
        if (password.length > 50) {
            errors.push('Password is too long');
        }
    }

    if (errors.length > 0) {
        return res.render('login', { 
            error: errors.join(', '),
            email: email, // Preserve email but not password
            validationErrors: errors // Send array of errors for more detailed display
        });
    }

    next();
};

const validateResetPassword = (req, res, next) => {
    const { password, confirmPassword, email } = req.body;
    const errors = [];

    // Password validation
    if (!password) {
        errors.push('Password is required');
    } else {
        if (password.length < 6) {
            errors.push('Password must be at least 6 characters long');
        }
        if (password.includes(' ')) {
            errors.push('Password cannot contain spaces');
        }
    }

    // Confirm password validation
    if (!confirmPassword) {
        errors.push('Confirm password is required');
    } else if (password !== confirmPassword) {
        errors.push('Passwords do not match');
    }

    if (errors.length > 0) {
        return res.render('resetPassword', { 
            error: errors.join(', '),
            email
        });
    }

    next();
};

const validateForgotPassword = (req, res, next) => {
    let { email } = req.body;
    const errors = [];

    // Email validation
    if (!email) {
        errors.push('Email is required');
    } else {
        // Remove any spaces before checking
        email = email.trim();
        req.body.email = email; // Update the request body with trimmed email
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            errors.push('Please enter a valid email address');
        }
        // Check for any spaces in the email
        if (email.includes(' ')) {
            errors.push('Email cannot contain spaces');
        }
    }

    if (errors.length > 0) {
        return res.render('forgotPassword', { 
            error: errors.join(', '),
            email: email
        });
    }

    next();
};

module.exports = {
    validateSignup,
    validateLogin,
    validateResetPassword,
    validateForgotPassword
}; 