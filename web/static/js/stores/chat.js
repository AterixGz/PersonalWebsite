document.addEventListener('alpine:init', () => {
Alpine.store('chat', {
    messages: [],
    input: '',
    streaming: false,
    currentStreamContent: '',
    
    formatMessage(text) {
      // Basic formatting to convert newlines to <br> for HTML rendering
      if (!text) return '';
      return text.replace(/\n/g, '<br>');
    },

    scrollToBottom() {
      requestAnimationFrame(() => {
        const container = document.getElementById('scroll-container');
        if (container) container.scrollTop = container.scrollHeight;
      });
    },

    async loadHistory() {
      try {
        const res = await fetch('/api/chat/history?limit=50');
        if (res.ok) {
          this.messages = await res.json();
          this.scrollToBottom();
        } else {
            this.messages = [
                {id: 0, role: 'assistant', content: 'สวัสดี! ฉันคือผู้ช่วย AI ของคุณ มีอะไรให้ช่วยไหม?'}
            ];
        }
      } catch (err) {
        this.messages = [
            {id: 0, role: 'assistant', content: 'สวัสดี! ฉันคือผู้ช่วย AI ของคุณ มีอะไรให้ช่วยไหม?'}
        ];
      }
    },
    
    async send() {
      if (!this.input.trim() || this.streaming) return;
      
      const userMsg = { id: Date.now(), role: 'user', content: this.input };
      this.messages.push(userMsg);
      const textToSend = this.input;
      this.input = '';
      this.streaming = true;
      this.currentStreamContent = '';
      this.scrollToBottom();
      
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: textToSend })
        });
        
        if (!response.body) throw new Error('No readable stream');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          const chunk = decoder.decode(value, { stream: true });
          
          // Basic SSE parsing logic (assuming 'data: ...\n\n' format)
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data);
                // Adjust this depending on your actual SSE JSON payload structure
                if (parsed.text || parsed.content) {
                  this.currentStreamContent += (parsed.text || parsed.content);
                  this.scrollToBottom();
                }
              } catch (e) {
                // If not JSON, just append raw text
                this.currentStreamContent += data;
                this.scrollToBottom();
              }
            } else if (!line.startsWith('event:') && line.trim() !== '') {
                // fallback if backend doesn't send SSE but raw text chunks
                this.currentStreamContent += line;
                this.scrollToBottom();
            }
          }
        }
        
        this.messages.push({
          id: Date.now(),
          role: 'assistant',
          content: this.currentStreamContent || 'ขออภัย ฉันไม่สามารถตอบได้ในขณะนี้'
        });
        
      } catch (err) {
        console.error('Chat error', err);
        // Simulate fake response for dev if API fails
        setTimeout(() => {
          this.currentStreamContent = 'ระบบตอบกลับอัตโนมัติ: การเชื่อมต่อมีปัญหา';
          setTimeout(() => {
            this.messages.push({ id: Date.now(), role: 'assistant', content: this.currentStreamContent });
            this.streaming = false;
            this.currentStreamContent = '';
            this.scrollToBottom();
          }, 500);
        }, 1000);
        return;
      }
      
      this.streaming = false;
      this.currentStreamContent = '';
      this.scrollToBottom();
    }
  });
});
