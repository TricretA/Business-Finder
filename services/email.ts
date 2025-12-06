
export const sendEmail = async (to: string, subject: string, body: string): Promise<boolean> => {
  // Simulate API delay and sending
  console.log(`[Email Service] Sending to: ${to}`);
  console.log(`Subject: ${subject}`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return success
  return true;
};
