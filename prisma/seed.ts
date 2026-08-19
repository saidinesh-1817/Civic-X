import { PrismaClient, Role, VerificationStatus, Priority, ComplaintStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Standard demo password hash: bcrypt hash of 'DemoPassword123!' (never store plaintext)
const DEMO_PASSWORD_HASH = bcrypt.hashSync('DemoPassword123!', 10);

export async function main() {
  console.log('🌱 Starting CivicSense database seed...');

  // ---------------------------------------------------------------------------
  // 1. Clean existing records (in reverse dependency order)
  // ---------------------------------------------------------------------------
  console.log('🧹 Cleaning existing records...');
  await prisma.notification.deleteMany();
  await prisma.resolution.deleteMany();
  await prisma.complaintStatusHistory.deleteMany();
  await prisma.complaintAssignment.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.departmentOffice.deleteMany();
  await prisma.officerProfile.deleteMany();
  await prisma.department.deleteMany();
  await prisma.user.deleteMany();

  // ---------------------------------------------------------------------------
  // 2. Seed the 10 Required Departments
  // ---------------------------------------------------------------------------
  console.log('🏢 Seeding 10 core departments...');
  const departmentData = [
    {
      name: 'Municipality / Sanitation',
      description: 'Solid waste management, garbage clearance, drain cleaning, and street sweeping services.',
      active: true,
    },
    {
      name: 'Roads & Infrastructure',
      description: 'Pothole repair, road resurfacing, footpath maintenance, and bridge safety.',
      active: true,
    },
    {
      name: 'Water Supply',
      description: 'Potable water distribution, pipeline leak repair, water contamination issues, and supply timings.',
      active: true,
    },
    {
      name: 'Electricity',
      description: 'Streetlight faults, power outages, damaged electrical poles, and exposed wiring maintenance.',
      active: true,
    },
    {
      name: 'Traffic',
      description: 'Traffic signal synchronization, road signages, zebra crossings, and congestion management.',
      active: true,
    },
    {
      name: 'Public Health',
      description: 'Vector control, disease prevention, public toilet hygiene, and medical clinic monitoring.',
      active: true,
    },
    {
      name: 'Environment / Parks',
      description: 'Maintenance of public parks, tree pruning, pollution checks, and urban greenery preservation.',
      active: true,
    },
    {
      name: 'Fire & Emergency',
      description: 'Fire hazard reporting, safety compliance, hydrant checks, and emergency preparedness.',
      active: true,
    },
    {
      name: 'Public Transport',
      description: 'Bus stop maintenance, commuter facilities, bus schedule reliability, and terminal upkeep.',
      active: true,
    },
    {
      name: 'Housing / Building Issues',
      description: 'Unauthorized construction alerts, building safety violations, and zoning compliance.',
      active: true,
    },
  ];

  const createdDepartments: Record<string, { id: string; name: string }> = {};

  for (const dept of departmentData) {
    const created = await prisma.department.create({
      data: dept,
    });
    createdDepartments[dept.name] = { id: created.id, name: created.name };
  }
  console.log(`✅ Successfully seeded ${Object.keys(createdDepartments).length} departments.`);

  // ---------------------------------------------------------------------------
  // 3. Seed Department Offices
  // ---------------------------------------------------------------------------
  console.log('📍 Seeding demo department offices...');
  const officeData = [
    // Municipality / Sanitation
    {
      department_id: createdDepartments['Municipality / Sanitation'].id,
      name: 'Central Sanitation Division HQ',
      address: 'Plot 101, Civic Center Road, Central Zone',
      latitude: 12.9716,
      longitude: 77.5946,
      active: true,
    },
    {
      department_id: createdDepartments['Municipality / Sanitation'].id,
      name: 'East Ward Sanitation Office',
      address: 'Building B, 8th Cross, Indiranagar East',
      latitude: 12.9810,
      longitude: 77.6320,
      active: true,
    },
    // Roads & Infrastructure
    {
      department_id: createdDepartments['Roads & Infrastructure'].id,
      name: 'City Roads Engineering Division',
      address: 'Works Complex, Old Airport Road',
      latitude: 12.9650,
      longitude: 77.6000,
      active: true,
    },
    {
      department_id: createdDepartments['Roads & Infrastructure'].id,
      name: 'West Infrastructure Maintenance Depot',
      address: 'Industrial Ring Road, Rajajinagar West',
      latitude: 12.9850,
      longitude: 77.5500,
      active: true,
    },
    // Water Supply
    {
      department_id: createdDepartments['Water Supply'].id,
      name: 'Central Water Board & Pumping Station',
      address: 'Reservoir Road, High Grounds',
      latitude: 12.9750,
      longitude: 77.6100,
      active: true,
    },
    // Electricity
    {
      department_id: createdDepartments['Electricity'].id,
      name: 'Metropolitan Electricity Operations Office',
      address: 'Power Grid Circle, MG Road Sector',
      latitude: 12.9700,
      longitude: 77.5800,
      active: true,
    },
    // Traffic
    {
      department_id: createdDepartments['Traffic'].id,
      name: 'Traffic Management & Signal Cell',
      address: 'Infantry Road, Central Police Annex',
      latitude: 12.9780,
      longitude: 77.5900,
      active: true,
    },
    // Public Health
    {
      department_id: createdDepartments['Public Health'].id,
      name: 'Public Health & Sanitation Annex',
      address: 'Health Directorate Building, Victoria Layout',
      latitude: 12.9720,
      longitude: 77.6050,
      active: true,
    },
    // Environment / Parks
    {
      department_id: createdDepartments['Environment / Parks'].id,
      name: 'Parks & Urban Forestry Division',
      address: 'Cubbon Park Administrative Block',
      latitude: 12.9760,
      longitude: 77.5920,
      active: true,
    },
    // Fire & Emergency
    {
      department_id: createdDepartments['Fire & Emergency'].id,
      name: 'Central Fire Station & Rescue Unit',
      address: 'South Fire Station Road',
      latitude: 12.9680,
      longitude: 77.5980,
      active: true,
    },
    // Public Transport
    {
      department_id: createdDepartments['Public Transport'].id,
      name: 'Metropolitan Transit Authority Cell',
      address: 'Kempegowda Bus Station Complex',
      latitude: 12.9770,
      longitude: 77.5720,
      active: true,
    },
    // Housing / Building Issues
    {
      department_id: createdDepartments['Housing / Building Issues'].id,
      name: 'Town Planning & Building Inspection Cell',
      address: 'Municipal Corporation HQ, Hudson Circle',
      latitude: 12.9690,
      longitude: 77.5890,
      active: true,
    },
  ];

  const createdOffices = [];
  for (const office of officeData) {
    const created = await prisma.departmentOffice.create({
      data: office,
    });
    createdOffices.push(created);
  }
  console.log(`✅ Successfully seeded ${createdOffices.length} department offices.`);

  // ---------------------------------------------------------------------------
  // 4. Seed Demo Users (Citizens, Officers, Admin) with Hashed Passwords
  // ---------------------------------------------------------------------------
  console.log('👥 Seeding demo users with secure hashed credentials...');
  
  // Demo Admin
  const demoAdmin = await prisma.user.create({
    data: {
      name: 'Demo Admin',
      email: 'demo.admin@civicsense.local',
      phone: '+91-9876543210',
      password_hash: DEMO_PASSWORD_HASH,
      role: Role.ADMIN,
    },
  });

  // Demo Officers
  const demoOfficerSanitationUser = await prisma.user.create({
    data: {
      name: 'Demo Officer Suresh (Sanitation)',
      email: 'demo.officer.sanitation@civicsense.local',
      phone: '+91-9876543211',
      password_hash: DEMO_PASSWORD_HASH,
      role: Role.OFFICER,
    },
  });

  const demoOfficerRoadsUser = await prisma.user.create({
    data: {
      name: 'Demo Officer Ramesh (Roads)',
      email: 'demo.officer.roads@civicsense.local',
      phone: '+91-9876543212',
      password_hash: DEMO_PASSWORD_HASH,
      role: Role.OFFICER,
    },
  });

  // Demo Citizens
  const demoCitizen1 = await prisma.user.create({
    data: {
      name: 'Demo Citizen Arun Kumar',
      email: 'demo.citizen.arun@civicsense.local',
      phone: '+91-9876543220',
      password_hash: DEMO_PASSWORD_HASH,
      role: Role.CITIZEN,
    },
  });

  const demoCitizen2 = await prisma.user.create({
    data: {
      name: 'Demo Citizen Priya Sharma',
      email: 'demo.citizen.priya@civicsense.local',
      phone: '+91-9876543221',
      password_hash: DEMO_PASSWORD_HASH,
      role: Role.CITIZEN,
    },
  });

  console.log('✅ Successfully seeded demo users (1 Admin, 2 Officers, 2 Citizens).');

  // ---------------------------------------------------------------------------
  // 5. Seed Officer Profiles
  // ---------------------------------------------------------------------------
  console.log('🎖️ Seeding demo officer profiles...');
  const sanitationOfficerProfile = await prisma.officerProfile.create({
    data: {
      user_id: demoOfficerSanitationUser.id,
      department_id: createdDepartments['Municipality / Sanitation'].id,
      designation: 'Senior Sanitation Inspector',
      verification_status: VerificationStatus.APPROVED,
    },
  });

  const roadsOfficerProfile = await prisma.officerProfile.create({
    data: {
      user_id: demoOfficerRoadsUser.id,
      department_id: createdDepartments['Roads & Infrastructure'].id,
      designation: 'Executive Road Maintenance Engineer',
      verification_status: VerificationStatus.APPROVED,
    },
  });
  console.log('✅ Successfully seeded officer profiles.');

  // ---------------------------------------------------------------------------
  // 6. Seed Demo Complaints & Relational Workflows
  // ---------------------------------------------------------------------------
  console.log('📋 Seeding demo complaints, assignments, status histories, and resolutions...');
  
  // Complaint 1: Sanitation issue (Status: ASSIGNED)
  const complaint1 = await prisma.complaint.create({
    data: {
      citizen_id: demoCitizen1.id,
      department_id: createdDepartments['Municipality / Sanitation'].id,
      office_id: createdOffices[0].id,
      title: 'Overflowing garbage bin near residential complex',
      description: 'The community garbage bin at 4th Main Indiranagar has not been cleared for 3 days and is overflowing onto the street.',
      photo_url: 'https://demo.civicsense.local/uploads/complaints/garbage-01.jpg',
      latitude: 12.9790,
      longitude: 77.6400,
      priority: Priority.HIGH,
      status: ComplaintStatus.ASSIGNED,
    },
  });

  // Assignment for Complaint 1
  await prisma.complaintAssignment.create({
    data: {
      complaint_id: complaint1.id,
      officer_id: sanitationOfficerProfile.id,
      assigned_by: demoAdmin.id,
    },
  });

  // Status History for Complaint 1
  await prisma.complaintStatusHistory.createMany({
    data: [
      {
        complaint_id: complaint1.id,
        status: ComplaintStatus.NEW,
        changed_by: demoCitizen1.id,
        note: 'Complaint registered by citizen.',
      },
      {
        complaint_id: complaint1.id,
        status: ComplaintStatus.ASSIGNED,
        changed_by: demoAdmin.id,
        note: 'Assigned to Senior Sanitation Inspector for prompt inspection.',
      },
    ],
  });

  // Notification for Complaint 1
  await prisma.notification.create({
    data: {
      recipient_user_id: demoCitizen1.id,
      complaint_id: complaint1.id,
      title: 'Complaint Assigned',
      message: 'Your complaint regarding overflowing garbage bin has been assigned to the Sanitation team.',
      type: 'COMPLAINT_ASSIGNED',
      is_read: false,
    },
  });

  // Complaint 2: Road pothole issue (Status: RESOLVED)
  const complaint2 = await prisma.complaint.create({
    data: {
      citizen_id: demoCitizen2.id,
      department_id: createdDepartments['Roads & Infrastructure'].id,
      office_id: createdOffices[2].id,
      title: 'Hazardous deep pothole on Main Arterial Road',
      description: 'A deep pothole has formed near the junction causing severe traffic slowdown and risk of two-wheeler accidents.',
      photo_url: 'https://demo.civicsense.local/uploads/complaints/pothole-01.jpg',
      latitude: 12.9670,
      longitude: 77.6020,
      priority: Priority.CRITICAL,
      status: ComplaintStatus.RESOLVED,
    },
  });

  // Assignment for Complaint 2
  await prisma.complaintAssignment.create({
    data: {
      complaint_id: complaint2.id,
      officer_id: roadsOfficerProfile.id,
      assigned_by: demoAdmin.id,
    },
  });

  // Status History for Complaint 2
  await prisma.complaintStatusHistory.createMany({
    data: [
      {
        complaint_id: complaint2.id,
        status: ComplaintStatus.NEW,
        changed_by: demoCitizen2.id,
        note: 'Complaint reported by citizen.',
      },
      {
        complaint_id: complaint2.id,
        status: ComplaintStatus.ASSIGNED,
        changed_by: demoAdmin.id,
        note: 'Assigned to Executive Road Maintenance Engineer.',
      },
      {
        complaint_id: complaint2.id,
        status: ComplaintStatus.IN_PROGRESS,
        changed_by: demoOfficerRoadsUser.id,
        note: 'Road repair crew dispatched with asphalt patcher.',
      },
      {
        complaint_id: complaint2.id,
        status: ComplaintStatus.RESOLVED,
        changed_by: demoOfficerRoadsUser.id,
        note: 'Pothole filled, leveled, and bitumen cold-mix applied successfully.',
      },
    ],
  });

  // Resolution for Complaint 2
  await prisma.resolution.create({
    data: {
      complaint_id: complaint2.id,
      officer_id: roadsOfficerProfile.id,
      photo_url: 'https://demo.civicsense.local/uploads/resolutions/pothole-fixed-01.jpg',
      note: 'Pothole completely filled with cold-mix asphalt, leveled, and compacted. Area cleared for normal vehicular movement.',
    },
  });

  // Notification for Complaint 2
  await prisma.notification.create({
    data: {
      recipient_user_id: demoCitizen2.id,
      complaint_id: complaint2.id,
      title: 'Complaint Resolved',
      message: 'Your complaint regarding hazardous pothole has been resolved by the Roads & Infrastructure department.',
      type: 'COMPLAINT_RESOLVED',
      is_read: true,
    },
  });

  console.log('✅ Successfully seeded complaints and full relational workflows.');
  console.log('🎉 CivicSense database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
