const salaryService = require('./src/services/salary.service').default;

async function testBatch() {
  const data = {
    month: "202611",
    users: [
      { userId: 1, basicSalary: 12000000 },
      { userId: 2, basicSalary: 15000000 }
    ]
  };
  
  try {
    const res = await salaryService.calculateBatch(data, 1);
    console.log(JSON.stringify(res, null, 2));
  } catch(e) {
    console.error(e);
  }
}

testBatch();
