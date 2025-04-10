const Order = require('../../models/Order');
const User = require('../../models/userModel');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const salesReportController = {
    // Render sales report page with filters
    getSalesReportPage: async (req, res) => {
        try {
            // Get total sales for all time - only include delivered, payment completed orders
            const orders = await Order.find({
                status: 'Delivered', // Only include delivered orders
                paymentStatus: 'Completed' // Only include orders with completed payments
            });

            // Calculate summary statistics
            const totalSales = orders.reduce((sum, order) => sum + (order.total || 0), 0);
            const totalOrders = orders.length;
            
            // Get total customers
            const totalCustomers = await User.countDocuments({ role: 'user' });

            res.render('admin/sales/sales-report', {
                title: 'Sales Report',
                currentPage: 'sales-report',
                path: '/admin/sales-report',
                totalSales,
                totalOrders,
                totalCustomers
            });
        } catch (error) {
            console.error('Error loading sales report page:', error);
            req.flash('error', 'Failed to load sales report page');
            res.redirect('/admin/dashboard');
        }
    },

    // Generate sales report based on filters
    generateSalesReport: async (req, res) => {
        try {
            const { period, startDate, endDate } = req.body;
            
            // Set date range based on selected period
            let start, end;
            const now = new Date();
            
            if (period === 'custom' && startDate && endDate) {
                start = new Date(startDate);
                end = new Date(endDate);
                end.setHours(23, 59, 59, 999); // End of the day
            } else if (period === 'daily') {
                start = new Date(now.setHours(0, 0, 0, 0));
                end = new Date(now.setHours(23, 59, 59, 999));
            } else if (period === 'weekly') {
                start = new Date(now);
                start.setDate(now.getDate() - now.getDay()); // Start of week (Sunday)
                start.setHours(0, 0, 0, 0);
                end = new Date(now);
                end.setDate(start.getDate() + 6); // End of week (Saturday)
                end.setHours(23, 59, 59, 999);
            } else if (period === 'monthly') {
                start = new Date(now.getFullYear(), now.getMonth(), 1); // Start of month
                end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999); // End of month
            } else if (period === 'yearly') {
                start = new Date(now.getFullYear(), 0, 1); // Start of year
                end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999); // End of year
            } else {
                // Default to last 30 days
                start = new Date(now);
                start.setDate(now.getDate() - 30);
                start.setHours(0, 0, 0, 0);
                end = new Date(now.setHours(23, 59, 59, 999));
            }
            
            // Query orders within the date range - only include delivered, payment completed orders
            const orders = await Order.find({
                createdAt: { $gte: start, $lte: end },
                status: 'Delivered', // Only include delivered orders
                paymentStatus: 'Completed' // Only include orders with completed payments
            }).populate({
                path: 'user',
                select: 'name email'
            }).sort({ createdAt: -1 });
            
            // Calculate summary statistics
            let totalOrders = orders.length;
            let totalSales = 0;
            let totalOfferDiscount = 0;
            let totalCouponDiscount = 0;
            let totalGST = 0;
            
            orders.forEach(order => {
                totalSales += order.total || 0;
                totalOfferDiscount += order.offerDiscount || 0;
                totalCouponDiscount += order.couponDiscount || 0;
                totalGST += order.gst || 0;
            });
            
            // Format dates for display
            const formattedStartDate = start.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            const formattedEndDate = end.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            
            // Render the report
            res.render('admin/sales/sales-report-results', {
                title: 'Sales Report Results',
                currentPage: 'sales-report',
                path: '/admin/sales-report',
                orders,
                period,
                startDate: formattedStartDate,
                endDate: formattedEndDate,
                totalOrders,
                totalSales,
                totalOfferDiscount,
                totalCouponDiscount,
                totalGST,
                rawStartDate: start.toISOString().split('T')[0],
                rawEndDate: end.toISOString().split('T')[0]
            });
            
        } catch (error) {
            console.error('Error generating sales report:', error);
            req.flash('error', 'Failed to generate sales report');
            res.redirect('/admin/sales-report');
        }
    },
    
    // Download sales report as PDF
    downloadPDF: async (req, res) => {
        try {
            const { startDate, endDate, period } = req.query;
            
            // Parse dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            // Query orders within the date range - only include delivered, payment completed orders
            const orders = await Order.find({
                createdAt: { $gte: start, $lte: end },
                status: 'Delivered', // Only include delivered orders
                paymentStatus: 'Completed' // Only include orders with completed payments
            }).populate({
                path: 'user',
                select: 'name email'
            }).sort({ createdAt: -1 });
            
            // Calculate summary statistics
            let totalOrders = orders.length;
            let totalSales = 0;
            let totalOfferDiscount = 0;
            let totalCouponDiscount = 0;
            let totalGST = 0;
            
            orders.forEach(order => {
                totalSales += order.total || 0;
                totalOfferDiscount += order.offerDiscount || 0;
                totalCouponDiscount += order.couponDiscount || 0;
                totalGST += order.gst || 0;
            });
            
            // Create PDF document
            const doc = new PDFDocument({ margin: 50 });
            
            // Set response headers
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${period}-${new Date().toISOString().split('T')[0]}.pdf`);
            
            // Pipe the PDF to the response
            doc.pipe(res);
            
            // Add title and header
            doc.fontSize(20).text('Brewtopia - Sales Report', { align: 'center' });
            doc.moveDown();
            
            // Add report period
            doc.fontSize(12).text(`Report Period: ${period.charAt(0).toUpperCase() + period.slice(1)}`, { align: 'center' });
            doc.fontSize(10).text(`From: ${start.toLocaleDateString()} To: ${end.toLocaleDateString()}`, { align: 'center' });
            doc.moveDown(2);
            
            // Add summary section
            doc.fontSize(14).text('Summary', { underline: true });
            doc.moveDown(0.5);
            doc.fontSize(10).text(`Total Orders: ${totalOrders}`);
            doc.fontSize(10).text(`Total Sales: ₹${totalSales.toFixed(2)}`);
            doc.fontSize(10).text(`Total Offer Discounts: ₹${totalOfferDiscount.toFixed(2)}`);
            doc.fontSize(10).text(`Total Coupon Discounts: ₹${totalCouponDiscount.toFixed(2)}`);
            doc.fontSize(10).text(`Total GST: ₹${totalGST.toFixed(2)}`);
            doc.moveDown(2);
            
            // Add orders table
            doc.fontSize(14).text('Order Details', { underline: true });
            doc.moveDown(0.5);
            
            // Table headers
            const tableTop = doc.y;
            doc.fontSize(9).text('Order ID', 50, tableTop);
            doc.text('Date', 130, tableTop);
            doc.text('Customer', 210, tableTop);
            doc.text('Status', 290, tableTop);
            doc.text('Payment', 350, tableTop);
            doc.text('Amount', 410, tableTop);
            doc.text('Discount', 470, tableTop);
            
            // Draw a line
            doc.moveTo(50, doc.y + 5).lineTo(550, doc.y + 5).stroke();
            doc.moveDown();
            
            // Add order rows
            let y = doc.y;
            orders.forEach((order, index) => {
                const orderId = order._id.toString().slice(-8).toUpperCase();
                const date = new Date(order.createdAt).toLocaleDateString();
                const customer = order.user ? order.user.name : 'N/A';
                const status = order.status;
                const payment = order.paymentMethod;
                const amount = `₹${order.total.toFixed(2)}`;
                const discount = `₹${((order.offerDiscount || 0) + (order.couponDiscount || 0)).toFixed(2)}`;
                
                doc.fontSize(8).text(orderId, 50, y);
                doc.text(date, 130, y);
                doc.text(customer.substring(0, 15), 210, y);
                doc.text(status, 290, y);
                doc.text(payment, 350, y);
                doc.text(amount, 410, y);
                doc.text(discount, 470, y);
                
                y += 15;
                
                // Add a new page if we're near the bottom
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                    
                    // Add headers to new page
                    doc.fontSize(9).text('Order ID', 50, y);
                    doc.text('Date', 130, y);
                    doc.text('Customer', 210, y);
                    doc.text('Status', 290, y);
                    doc.text('Payment', 350, y);
                    doc.text('Amount', 410, y);
                    doc.text('Discount', 470, y);
                    
                    // Draw a line
                    doc.moveTo(50, y + 15).lineTo(550, y + 15).stroke();
                    y += 20;
                }
            });
            
            // Add footer
            doc.fontSize(8).text('Generated on: ' + new Date().toLocaleString(), 50, 700, { align: 'center' });
            
            // Finalize the PDF
            doc.end();
            
        } catch (error) {
            console.error('Error generating PDF report:', error);
            req.flash('error', 'Failed to generate PDF report');
            res.redirect('/admin/sales-report');
        }
    },
    
    // Download sales report as Excel
    downloadExcel: async (req, res) => {
        try {
            const { startDate, endDate, period } = req.query;
            
            // Parse dates
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            // Query orders within the date range - only include delivered, payment completed orders
            const orders = await Order.find({
                createdAt: { $gte: start, $lte: end },
                status: 'Delivered', // Only include delivered orders
                paymentStatus: 'Completed' // Only include orders with completed payments
            }).populate({
                path: 'user',
                select: 'name email'
            }).sort({ createdAt: -1 });
            
            // Calculate summary statistics
            let totalOrders = orders.length;
            let totalSales = 0;
            let totalOfferDiscount = 0;
            let totalCouponDiscount = 0;
            let totalGST = 0;
            
            orders.forEach(order => {
                totalSales += order.total || 0;
                totalOfferDiscount += order.offerDiscount || 0;
                totalCouponDiscount += order.couponDiscount || 0;
                totalGST += order.gst || 0;
            });
            
            // Create a new Excel workbook
            const workbook = new ExcelJS.Workbook();
            workbook.creator = 'Brewtopia Admin';
            workbook.created = new Date();
            
            // Add a worksheet
            const worksheet = workbook.addWorksheet('Sales Report');
            
            // Add title
            worksheet.mergeCells('A1:H1');
            const titleCell = worksheet.getCell('A1');
            titleCell.value = 'Brewtopia - Sales Report';
            titleCell.font = { size: 16, bold: true };
            titleCell.alignment = { horizontal: 'center' };
            
            // Add report period
            worksheet.mergeCells('A2:H2');
            const periodCell = worksheet.getCell('A2');
            periodCell.value = `Report Period: ${period.charAt(0).toUpperCase() + period.slice(1)} (${start.toLocaleDateString()} - ${end.toLocaleDateString()})`;
            periodCell.font = { size: 12 };
            periodCell.alignment = { horizontal: 'center' };
            
            // Add summary section
            worksheet.mergeCells('A4:B4');
            worksheet.getCell('A4').value = 'Summary';
            worksheet.getCell('A4').font = { bold: true };
            
            worksheet.getCell('A5').value = 'Total Orders:';
            worksheet.getCell('B5').value = totalOrders;
            
            worksheet.getCell('A6').value = 'Total Sales:';
            worksheet.getCell('B6').value = totalSales;
            worksheet.getCell('B6').numFmt = '₹#,##0.00';
            
            worksheet.getCell('A7').value = 'Total Offer Discounts:';
            worksheet.getCell('B7').value = totalOfferDiscount;
            worksheet.getCell('B7').numFmt = '₹#,##0.00';
            
            worksheet.getCell('A8').value = 'Total Coupon Discounts:';
            worksheet.getCell('B8').value = totalCouponDiscount;
            worksheet.getCell('B8').numFmt = '₹#,##0.00';
            
            worksheet.getCell('A9').value = 'Total GST:';
            worksheet.getCell('B9').value = totalGST;
            worksheet.getCell('B9').numFmt = '₹#,##0.00';
            
            // Add orders table header
            worksheet.getCell('A11').value = 'Order ID';
            worksheet.getCell('B11').value = 'Date';
            worksheet.getCell('C11').value = 'Customer';
            worksheet.getCell('D11').value = 'Status';
            worksheet.getCell('E11').value = 'Payment Method';
            worksheet.getCell('F11').value = 'Subtotal';
            worksheet.getCell('G11').value = 'Offer Discount';
            worksheet.getCell('H11').value = 'Coupon Discount';
            worksheet.getCell('I11').value = 'GST';
            worksheet.getCell('J11').value = 'Total';
            
            // Style the header row
            ['A11', 'B11', 'C11', 'D11', 'E11', 'F11', 'G11', 'H11', 'I11', 'J11'].forEach(cell => {
                worksheet.getCell(cell).font = { bold: true };
                worksheet.getCell(cell).fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: 'FFD3D3D3' }
                };
            });
            
            // Add order data
            orders.forEach((order, index) => {
                const rowIndex = index + 12; // Start from row 12
                
                worksheet.getCell(`A${rowIndex}`).value = order._id.toString().slice(-8).toUpperCase();
                worksheet.getCell(`B${rowIndex}`).value = new Date(order.createdAt);
                worksheet.getCell(`B${rowIndex}`).numFmt = 'yyyy-mm-dd';
                worksheet.getCell(`C${rowIndex}`).value = order.user ? order.user.name : 'N/A';
                worksheet.getCell(`D${rowIndex}`).value = order.status;
                worksheet.getCell(`E${rowIndex}`).value = order.paymentMethod;
                worksheet.getCell(`F${rowIndex}`).value = order.subtotal || 0;
                worksheet.getCell(`F${rowIndex}`).numFmt = '₹#,##0.00';
                worksheet.getCell(`G${rowIndex}`).value = order.offerDiscount || 0;
                worksheet.getCell(`G${rowIndex}`).numFmt = '₹#,##0.00';
                worksheet.getCell(`H${rowIndex}`).value = order.couponDiscount || 0;
                worksheet.getCell(`H${rowIndex}`).numFmt = '₹#,##0.00';
                worksheet.getCell(`I${rowIndex}`).value = order.gst || 0;
                worksheet.getCell(`I${rowIndex}`).numFmt = '₹#,##0.00';
                worksheet.getCell(`J${rowIndex}`).value = order.total || 0;
                worksheet.getCell(`J${rowIndex}`).numFmt = '₹#,##0.00';
            });
            
            // Set column widths
            worksheet.columns.forEach(column => {
                column.width = 15;
            });
            
            // Set response headers
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=sales-report-${period}-${new Date().toISOString().split('T')[0]}.xlsx`);
            
            // Write to response
            await workbook.xlsx.write(res);
            res.end();
            
        } catch (error) {
            console.error('Error generating Excel report:', error);
            req.flash('error', 'Failed to generate Excel report');
            res.redirect('/admin/sales-report');
        }
    }
};

module.exports = salesReportController;