const Coupon = require('../../models/Coupon');

exports.getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.render('admin/coupons', {
            title: 'Manage Coupons',
            coupons,
            messages: {
                success: req.flash('success'),
                error: req.flash('error')
            }
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        req.flash('error', 'Failed to fetch coupons');
        res.redirect('/admin/dashboard');
    }
};

exports.createCoupon = async (req, res) => {
    try {
        console.log('Received coupon data:', req.body);
        
        const {
            code,
            description,
            discountAmount,
            minimumPurchase,
            startDate,
            endDate,
            usageLimit
        } = req.body;

        // Set discount type to fixed
        const discountType = 'fixed';

        // Validate dates
        const now = new Date();
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);
        
        // Validate start date is not in the past (with some tolerance)
        const nowWithoutMillis = new Date(now.setMilliseconds(0));
        const startDateWithoutMillis = new Date(startDateObj.setMilliseconds(0));

        // Allow for a small time difference (5 minutes) to account for form submission delay
        const fiveMinutesAgo = new Date(nowWithoutMillis.getTime() - 5 * 60 * 1000);

        if (startDateWithoutMillis < fiveMinutesAgo) {
            console.log('Start date validation failed - date is in the past');
            console.log('Start date:', startDateWithoutMillis);
            console.log('Five minutes ago:', fiveMinutesAgo);
            req.flash('error', 'Start date cannot be in the past');
            return res.redirect('/admin/coupons');
        }

        // Validate end date is after start date
        if (startDateObj >= endDateObj) {
            req.flash('error', 'End date must be after start date');
            return res.redirect('/admin/coupons');
        }

        // Validate discount amount
        if (discountAmount <= 0) {
            req.flash('error', 'Discount amount must be greater than 0');
            return res.redirect('/admin/coupons');
        }

        // Validate minimum purchase
        if (minimumPurchase < 0) {
            req.flash('error', 'Minimum purchase cannot be negative');
            return res.redirect('/admin/coupons');
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            req.flash('error', 'Coupon code already exists');
            return res.redirect('/admin/coupons');
        }

        // Create the coupon
        const newCoupon = await Coupon.create({
            code: code.toUpperCase(),
            description,
            discountType,  // Always 'fixed'
            discountAmount,
            minimumPurchase,
            startDate: startDateObj,
            endDate: endDateObj,
            usageLimit: usageLimit || null,
            isActive: true
        });
        
        console.log('Created coupon:', newCoupon);

        req.flash('success', 'Coupon created successfully');
        res.redirect('/admin/coupons');
    } catch (error) {
        console.error('Error creating coupon:', error);
        req.flash('error', 'Failed to create coupon: ' + error.message);
        res.redirect('/admin/coupons');
    }
};

exports.toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();

        res.json({
            success: true,
            message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling coupon status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update coupon status'
        });
    }
};

exports.deleteCoupon = async (req, res) => {
    try {
        const couponId = req.params.id;
        
        const coupon = await Coupon.findById(couponId);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }
        
        await coupon.deleteOne();
        
        return res.json({
            success: true,
            message: 'Coupon deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete coupon: ' + error.message
        });
    }
}; 