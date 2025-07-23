require('dotenv').config();
const Fastify = require('fastify');
const cors = require('@fastify/cors');
const { createClient } = require('@supabase/supabase-js');

const fastify = Fastify({ logger: true });
fastify.register(cors);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Health check
fastify.get('/', async (request, reply) => {
  return { message: 'HRIS server is running 👋' };
});

// GET profile by ID
fastify.get('/profile/:id', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found' };
});

// PATCH update profile
fastify.patch('/profile/:id', async (request, reply) => {
  const id = parseInt(request.params.id);
  const updates = request.body;
  const { data, error } = await supabase
    .from('employees')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found or not updated' };
});

// GET contract status
fastify.get('/profile/:id/contract', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('contract_type, start_date, probation_end, status')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Employee not found' };
});

// GET leave balance
fastify.get('/profile/:id/leave-balance', async (request, reply) => {
  const id = parseInt(request.params.id);
  const { data, error } = await supabase
    .from('employees')
    .select('annual_leave_balance, personal_leave_balance, wellbeing_day_balance')
    .eq('id', id)
    .maybeSingle();
  if (error) return reply.code(500).send(error);
  return data || { message: 'Leave data not found' };
});

// POST new employee
fastify.post('/profile', async (request, reply) => {
  const newEmployee = request.body;

  // Ambil id terbesar (terakhir)
  const { data: lastEmployee, error: lastError } = await supabase
    .from('employees')
    .select('id')
    .order('id', { ascending: false })
    .limit(1)
    .single();

  // Kalau ada error selain tabel kosong
  if (lastError && lastError.code !== 'PGRST116') {
    return reply.code(500).send({ error: 'Gagal mengambil employee_id terakhir', detail: lastError });
  }

  // Tentukan id berikutnya
  const nextId = lastEmployee?.id ? lastEmployee.id + 1 : 1;

  const toInsert = {
    id: nextId,
    full_name: newEmployee.full_name,
    email: newEmployee.email,
    position: newEmployee.position,
    department: newEmployee.department,
    start_date: newEmployee.start_date,
    probation_end: newEmployee.probation_end,
    contract_type: newEmployee.contract_type,
    annual_leave_balance: newEmployee.annual_leave_balance,
    personal_leave_balance: newEmployee.personal_leave_balance,
    wellbeing_day_balance: newEmployee.wellbeing_day_balance,
    bank_account: newEmployee.bank_account,
    npwp_number: newEmployee.npwp_number,
    status: newEmployee.status
  };

  // Simpan data ke Supabase
  const { data, error } = await supabase
    .from('employees')
    .insert(toInsert)
    .select()
    .single();

  if (error) {
    return reply.code(500).send({ error: 'Gagal menyimpan data karyawan', detail: error });
  }

  return reply.code(201).send({
    message: 'Employee added successfully',
    employee: data
  });
});

/// POST /leave-preview 
fastify.post('/leave-preview', async (request, reply) => {
  const { employee_id, leave_type, start_date, days } = request.body;

  // Konversi start_date ke objek Date
  const start = new Date(start_date); // Asumsikan format sudah 'YYYY-MM-DD'
  const current = new Date(start);

  // ❗ Validasi cuti tidak bisa backdate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startClone = new Date(start);
  startClone.setHours(0, 0, 0, 0);

  if (startClone < today) {
    return reply.code(400).send({
      message: 'Tanggal cuti tidak boleh di masa lalu'
    });
  }

  // Hitung end_date berdasarkan hari kerja
  let workDays = 0;
  while (workDays < days) {
    const d = current.getDay(); // 0: Minggu, 6: Sabtu
    if (d !== 0 && d !== 6) workDays++;
    if (workDays < days) current.setDate(current.getDate() + 1);
  }

  const end = new Date(current);
  const pad = (n) => (n < 10 ? '0' + n : n);
  const end_date = `${pad(end.getDate())}-${pad(end.getMonth() + 1)}-${end.getFullYear()}`;

  // Ambil saldo cuti
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('annual_leave_balance, personal_leave_balance, wellbeing_day_balance')
    .eq('id', employee_id)
    .single();

  if (empError || !employee) {
    return reply.code(404).send({ message: 'Employee not found' });
  }

  // Tentukan jenis cuti dan saldo saat ini
  const type = leave_type.toLowerCase().replace(/\s+/g, '_');
  let currentBalance = 0;

  if (type.includes('annual')) {
    currentBalance = employee.annual_leave_balance;
  } else if (type.includes('personal')) {
    currentBalance = employee.personal_leave_balance;
  } else if (type.includes('wellbeing')) {
    currentBalance = employee.wellbeing_day_balance;
  } else {
    return reply.code(400).send({ message: 'Invalid leave type' });
  }

  const sufficient = currentBalance >= days;
  const remaining_balance = sufficient ? currentBalance - days : currentBalance;

  return reply.send({
    confirmed: sufficient,
    sufficient,
    start_date,
    end_date,
    days,
    remaining_balance,
    message: sufficient
      ? 'Saldo mencukupi. Silakan lanjutkan pengajuan.'
      : 'Saldo tidak mencukupi untuk cuti ini.'
  });
});

// POST leave request with auto approval
fastify.post('/leave/apply', async (request, reply) => {
  const { employee_id, leave_type, start_date, days } = request.body;
  const start = new Date(start_date); // langsung, karena sudah YYYY-MM-DD

  // ❗ Validasi cuti tidak bisa backdate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startClone = new Date(start);
  startClone.setHours(0, 0, 0, 0);

  if (startClone < today) {
    return reply.code(400).send({
      message: 'Tanggal cuti tidak boleh di masa lalu'
    });
  }
  
  // Hitung end_date berdasarkan hari kerja
  let workDays = 0;
  const current = new Date(start);

  while (workDays < days) {
    const d = current.getDay(); // 0: Minggu, 6: Sabtu
    if (d !== 0 && d !== 6) workDays++;
    if (workDays < days) current.setDate(current.getDate() + 1);
  }

  const end = new Date(current);
  const pad = (n) => (n < 10 ? '0' + n : n);
  const end_date = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

  // Ambil saldo cuti
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('annual_leave_balance, personal_leave_balance, wellbeing_day_balance')
    .eq('id', employee_id)
    .single();

  if (empError || !employee) {
    return reply.code(404).send({ message: 'Employee not found' });
  }

  // Tentukan jenis cuti dan saldo saat ini
  const type = leave_type.toLowerCase().replace(/\s+/g, '_');
  let currentBalance = 0;
  let balanceField = '';

  if (type.includes('annual')) {
    currentBalance = employee.annual_leave_balance;
    balanceField = 'annual_leave_balance';
  } else if (type.includes('personal')) {
    currentBalance = employee.personal_leave_balance;
    balanceField = 'personal_leave_balance';
  } else if (type.includes('wellbeing')) {
    currentBalance = employee.wellbeing_day_balance;
    balanceField = 'wellbeing_day_balance';
  } else {
    return reply.code(400).send({ message: 'Invalid leave type' });
  }

  if (currentBalance < days) {
    return reply.code(400).send({ message: 'Saldo cuti tidak mencukupi' });
  }

  // Insert ke leave_requests
  const { error: insertError } = await supabase.from('leave_requests').insert([
    {
      employee_id,
      leave_type,
      start_date,
      end_date,
      status: 'pending',
      requested_at: new Date().toISOString(),
      days
    }
  ]);

  if (insertError) {
    return reply.code(500).send({ message: 'Gagal menyimpan cuti', detail: insertError.message });
  }

  // Update saldo cuti
  const { error: updateError } = await supabase
    .from('employees')
    .update({ [balanceField]: currentBalance - days })
    .eq('id', employee_id);

  if (updateError) {
    return reply.code(500).send({ message: 'Gagal memperbarui saldo cuti', detail: updateError.message });
  }

  return reply.send({
    message: 'Pengajuan cuti berhasil disimpan',
    start_date,
    end_date,
    days,
    remaining_balance: currentBalance - days
  });
});

// DELETE leave cancel
fastify.post('/leave/cancel', async (request, reply) => {
  const { employee_id, start_date } = request.body;

  const { data: leave, error: leaveError } = await supabase
    .from('leave_requests')
    .select('id, leave_type, days, status')
    .eq('employee_id', employee_id)
    .eq('start_date', start_date)
    .single();

  if (leaveError || !leave) {
    return reply.code(404).send({ message: 'Leave request not found.' });
  }

  if (leave.status !== 'pending') {
    return reply.code(400).send({ message: 'Only pending leave requests can be canceled.' });
  }

  // Get current leave balance
  const { data: employee, error: empError } = await supabase
    .from('employees')
    .select('annual_leave_balance, personal_leave_balance, wellbeing_day_balance')
    .eq('id', employee_id)
    .single();

  if (empError || !employee) {
    return reply.code(404).send({ message: 'Employee not found.' });
  }

  const type = leave.leave_type.toLowerCase().replace(/\s+/g, '_');
  let balanceField = '';
  let updatedBalance = 0;

  if (type.includes('annual')) {
    balanceField = 'annual_leave_balance';
    updatedBalance = employee.annual_leave_balance + leave.days;
  } else if (type.includes('personal')) {
    balanceField = 'personal_leave_balance';
    updatedBalance = employee.personal_leave_balance + leave.days;
  } else if (type.includes('wellbeing')) {
    balanceField = 'wellbeing_day_balance';
    updatedBalance = employee.wellbeing_day_balance + leave.days;
  } else {
    return reply.code(400).send({ message: 'Invalid leave type.' });
  }

  // Delete the leave request
  const { error: deleteError } = await supabase
    .from('leave_requests')
    .delete()
    .eq('id', leave.id);

  if (deleteError) {
    return reply.code(500).send({ message: 'Failed to cancel the leave request.', detail: deleteError.message });
  }

  // Restore balance
  const { error: updateError } = await supabase
    .from('employees')
    .update({ [balanceField]: updatedBalance })
    .eq('id', employee_id);

  if (updateError) {
    return reply.code(500).send({ message: 'Failed to restore leave balance.', detail: updateError.message });
  }

  return reply.send({
    message: 'Leave request has been successfully canceled and balance restored.',
    returned_days: leave.days,
    new_balance: updatedBalance,
  });
});

// GET /payslips/:employee_id
fastify.get('/payslips/:employee_id', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { data, error } = await supabase
    .from('payslips')
    .select('period, file_url')
    .eq('employee_id', employee_id)
    .order('period', { ascending: false });
  if (error) return reply.code(500).send(error);
  return data;
});

// GET /trainings/:employee_id
fastify.get('/trainings/:employee_id', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { data, error } = await supabase
    .from('training_participants')
    .select('training_id, feedback, certificate_url, trainings(title, scheduled_date, mandatory)')
    .eq('employee_id', employee_id);
  if (error) return reply.code(500).send(error);
  return data;
});

// POST /trainings/:employee_id/feedback
fastify.post('/trainings/:employee_id/feedback', async (request, reply) => {
  const employee_id = parseInt(request.params.employee_id);
  const { training_id, feedback } = request.body;

  const { data, error } = await supabase
    .from('training_participants')
    .update({ feedback })
    .eq('employee_id', employee_id)
    .eq('training_id', training_id)
    .select()
    .maybeSingle();

  if (error) return reply.code(500).send(error);
  return data || { message: 'Training feedback not saved' };
});

// POST /remote-request
fastify.post('/remote-request', async (request, reply) => {
  const { employee_id, work_mode, reason } = request.body;

  const payload = {
    employee_id,
    work_mode,
    reason,
    requested_at: new Date().toISOString(),
    status: 'pending'
  };

  console.log('Payload:', payload);

  const { data, error } = await supabase
    .from('remote_request')
    .insert([payload]);

  console.log('Insert response:', { data, error });

  if (error) {
    fastify.log.error('Insert failed:', error);
    return reply.code(500).send({ message: 'Insert to Supabase failed', details: error.message || error });
  }

  return reply.code(201).send({ message: 'Request submitted', data, payload });
});

// 1. GET Performance Review & Development Plan by Employee ID
fastify.get('/performance-review/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('performance_review')
    .select('result, period, year, detail, development_plan')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 2. GET KPI by Employee ID
fastify.get('/kpi/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('kpi')
    .select('kpi')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 3. GET Reward Record by Employee ID
fastify.get('/reward/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('reward')
    .select('reward')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 4. GET Disciplinary Record by Employee ID
fastify.get('/disciplinary/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('disciplinary')
    .select('disciplinary, outcome_letter')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 5. GET Grievance Record by Employee ID
fastify.get('/grievance/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('grievance')
    .select('grievance, follow_up, document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 6. GET Incident Report by Employee ID
fastify.get('/incident/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('incident')
    .select('incident, follow_up, document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 7. GET Timesheet by Employee ID
fastify.get('/timesheet/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('timesheet')
    .select('timesheet')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 8. GET Overtime Record by Employee ID
fastify.get('/overtime/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('overtime')
    .select('ot_record')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 9. GET Clearance Record by Employee ID
fastify.get('/clearance/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('clearance')
    .select('resignation_date, last_day, exit_interview, final_pay, revoke_it_access,collect_returned_assets, insurance_termination, related_document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 10. GET Onboarding Record by Employee ID
fastify.get('/onboarding/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('onboarding')
    .select('pre_day_one, day_one, week_one, first_month, day_30, related_document')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 11. GET Employee Transfer by Employee ID
fastify.get('/transfer/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('transfer')
    .select('last_position, last_position_period, new_position, start_date_of_new_position')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 12. GET Work Mode Status by Employee ID
fastify.get('/workmode/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('work_mode')
    .select('work_mode')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 13. GET Remote Request by Employee ID
fastify.get('/remote-request/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('remote_request')
    .select('work_mode, reason, status')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// 14. GET Remote Checklist by Employee ID
fastify.get('/remote-checklist/:employeeId', async (request, reply) => {
  const employeeId = parseInt(request.params.employeeId);
  const { data, error } = await supabase
    .from('remote_checklist')
    .select('work_mode, approval, internet, vpn_access, company_devices, work_schedule')
    .eq('employee_id', employeeId);
  if (error) return reply.code(500).send(error);
  return data;
});

// === POST Apply to Internal Job ===
fastify.post('/internal-application', async (request, reply) => {
  const { employee_id, apply_for_position } = request.body;
  const { data, error } = await supabase
    .from('recruitment')
    .insert([
      {
        employee_id: employee_id,
        apply_for_position: apply_for_position,
        status: 'Pending', // default status saat apply
      }
    ])
    .select('*')
    .single();

  if (error) return reply.code(500).send(error);
  return reply.code(201).send({ message: 'Application submitted successfully', data });
});

fastify.listen({ port: 3000 }, err => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
  console.log('✅ HRIS Fastify server (CSV version) is running on http://localhost:3000');
});
