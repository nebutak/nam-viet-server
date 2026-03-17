/**
 * TEST LOGIN SCRIPT
 * 
 * This script helps you test the login process and get OTP codes
 * for the seeded test users.
 */

const axios = require('axios');

const API_BASE = 'http://localhost:8000/api';

async function testLogin() {
  console.log('🔐 Testing Login Process...\n');

  const testUsers = [
    { email: 'admin@test.com', password: 'admin123', name: 'Admin User' },
    { email: 'nguyen.van.a@test.com', password: 'admin123', name: 'Nguyễn Văn A' },
    { email: 'tran.thi.b@test.com', password: 'admin123', name: 'Trần Thị B' }
  ];

  for (const user of testUsers) {
    try {
      console.log(`📧 Testing login for: ${user.name} (${user.email})`);
      
      // Step 1: Login (get OTP)
      const loginResponse = await axios.post(`${API_BASE}/auth/login`, {
        email: user.email,
        password: user.password
      });

      if (loginResponse.data.success && loginResponse.data.data.requireOTP) {
        console.log('✅ Step 1: Login successful - OTP required');
        console.log(`📱 OTP Code: ${loginResponse.data.data.code || 'Check your email'}`);
        console.log(`⏰ Expires in: ${loginResponse.data.data.expiresIn} seconds`);
        
        // If we have the OTP code (development mode), verify it
        if (loginResponse.data.data.code) {
          console.log('🔑 Attempting OTP verification...');
          
          const otpResponse = await axios.post(`${API_BASE}/auth/verify-otp`, {
            email: user.email,
            code: loginResponse.data.data.code
          });

          if (otpResponse.data.success) {
            console.log('✅ Step 2: OTP verification successful!');
            console.log(`🎫 Access Token: ${otpResponse.data.data.accessToken.substring(0, 50)}...`);
            console.log(`👤 User: ${otpResponse.data.data.user.fullName}`);
            console.log(`🏢 Role: ${otpResponse.data.data.user.role.roleName}`);
          } else {
            console.log('❌ Step 2: OTP verification failed');
            console.log('Error:', otpResponse.data.message);
          }
        } else {
          console.log('📧 OTP sent to email - check your inbox');
        }
      } else {
        console.log('❌ Login failed');
        console.log('Error:', loginResponse.data.message);
      }
      
      console.log('─'.repeat(60));
      
    } catch (error) {
      console.log('❌ Error testing login:');
      if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Message:', error.response.data.message || error.response.data);
      } else {
        console.log('Error:', error.message);
      }
      console.log('─'.repeat(60));
    }
  }

  console.log('\n🎯 MANUAL LOGIN INSTRUCTIONS:');
  console.log('1. Go to: http://localhost:5173/login');
  console.log('2. Use credentials: admin@test.com / admin123');
  console.log('3. Check console/email for OTP code');
  console.log('4. Enter OTP code to complete login');
  console.log('5. Navigate to: http://localhost:5173/sales-report');
}

// Run the test
testLogin().catch(console.error);