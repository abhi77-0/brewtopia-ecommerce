const Coupon = require('../models/Coupon');

const updateCouponUsage = async (userId, couponData) => {
    try {
        if (!couponData) return;

        const coupon = await Coupon.findOne({ code: couponData.code });
        if (!coupon) return;

        // Check if user has already used this coupon
        const userUsageCount = coupon.usedBy.filter(usage => 
            usage.userId.toString() === userId.toString()
        ).length;

        if (userUsageCount >= coupon.perUserLimit) {
            throw new Error('Coupon usage limit reached for this user');
        }

        // Check global usage limit
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            throw new Error('Coupon has reached maximum global usage limit');
        }

        // Increment global usage count
        coupon.usedCount = (coupon.usedCount || 0) + 1;
        
        // Add to user usage tracking
        coupon.usedBy.push({
            userId: userId,
            usedAt: new Date()
        });
        
        await coupon.save();
        console.log(`Updated coupon usage for ${coupon.code} by user ${userId}`);
        return true;
    } catch (error) {
        console.error('Error updating coupon usage:', error);
        throw error;
    }
};

module.exports = {
    updateCouponUsage
}; 