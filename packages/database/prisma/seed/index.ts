import { prisma } from "../../src/index";


async function main() {
  console.log("==================================");
  console.log("🌱 Starting database seed...");
  console.log("==================================");

  console.log("\n🎉 Database seed completed.");
}

main()
  .catch((error) => {
    console.error("\n❌ Database seed failed.");
    console.error(error);

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
