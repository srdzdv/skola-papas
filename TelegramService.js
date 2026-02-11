class TelegramService {
  // Telegram Bot Configuration
  // Replace these with your actual Telegram bot token and chat ID
  static botToken = "7971713630:AAG_4a7Oa1glJPgtPbdVzxp6Jy8OX1Rrcmk"; // Your Telegram bot token
  static chatId = "7730235789"; // Your Telegram chat ID

  /**
   * Sends a message to a Telegram chat via bot
   * @param {string} message - The message text to send
   * @returns {Promise<boolean>} - Returns true if successful, false otherwise
   */
  static async sendMessage(message) {
    if (!this.botToken || !this.chatId) {
      console.log("TelegramService: Bot token or chat ID is not configured.");
      return false;
    }

    const url = `https://api.telegram.org/bot${this.botToken}/sendMessage`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: this.chatId,
          text: message,
        }),
      });

      const data = await response.json();
      
      if (data.ok) {
        console.log("TelegramService: Message sent successfully");
        return true;
      } else {
        console.log("TelegramService: Failed to send message:", data.description);
        return false;
      }
    } catch (error) {
      console.error("TelegramService: Error sending Telegram message:", error);
      return false;
    }
  }

  /**
   * Formats and sends a suggestion feedback message to Telegram
   * @param {string} feedback - The user's feedback text
   * @param {string} userId - The user's ID
   * @param {string} escuelaId - The escuela ID
   * @param {string} escuelaNombre - The escuela name
   * @returns {Promise<boolean>} - Returns true if successful, false otherwise
   */
  static async sendSuggestionFeedback(feedback, userId, escuelaId, escuelaNombre) {
    const message = `📝 Skola Papás - Nueva Sugerencia\n\n` +
      `Escuela: ${escuelaNombre}\n` +
      `Escuela ID: ${escuelaId}\n` +
      `Usuario ID: ${userId}\n\n` +
      `Sugerencia:\n${feedback}`;

    return await this.sendMessage(message);
  }
}

export default TelegramService;
