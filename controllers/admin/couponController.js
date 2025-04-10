const Coupon = require('../../models/Coupon');

exports.getCoupons = async (req, res) => {
    try {
        // Pagination parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        // Get total count for pagination
        const totalCoupons = await Coupon.countDocuments();
        const totalPages = Math.ceil(totalCoupons / limit);
        
        // Get paginated coupons
        const coupons = await Coupon.find()
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        res.render('admin/coupons', {
            title: 'Manage Coupons',
            coupons,
            path: '/admin/coupons',
            pagination: {
                page,
                limit,
                totalCoupons,
                totalPages
            },
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
        
        // Set both dates to the beginning of the day for comparison
        const todayStart = new Date(now.setHours(0, 0, 0, 0));
        const startDay = new Date(startDateObj.setHours(0, 0, 0, 0));
        
        // Check if start date is before today
        if (startDay < todayStart) {
            return res.status(400).json({
                success: false,
                message: 'Start date cannot be in the past'
            });
        }

        // Validate end date is after start date
        if (endDateObj <= startDateObj) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Validate discount amount
        if (discountAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Discount amount must be greater than 0'
            });
        }

        // Validate minimum purchase
        if (minimumPurchase < 0) {
            return res.status(400).json({
                success: false,
                message: 'Minimum purchase cannot be negative'
            });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code already exists'
            });
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

        return res.status(201).json({
            success: true,
            message: 'Coupon created successfully',
            coupon: newCoupon
        });
    } catch (error) {
        console.error('Error creating coupon:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create coupon: ' + error.message
        });
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