import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const MockOracle = await ethers.getContractFactory("MockOracle");
  const oracle = await MockOracle.deploy();
  await oracle.waitForDeployment();
  const oracleAddress = await oracle.getAddress();
  console.log("MockOracle:", oracleAddress);

  const SwarmSwapAgent = await ethers.getContractFactory("SwarmSwapAgent");
  const agent = await SwarmSwapAgent.deploy(oracleAddress);
  await agent.waitForDeployment();
  const agentAddress = await agent.getAddress();
  console.log("SwarmSwapAgent:", agentAddress);

  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network 0g-galileo ${agentAddress} ${oracleAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
