import { prisma } from "@repo/database";

async function main() {
  const user = await prisma.user.create({
    data: {
      id: crypto.randomUUID(),
      name: `User-${Date.now().toString().slice(6)}`,
      email: `test-${Date.now()}@example.com`,
    },
  });

  console.log(user);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
