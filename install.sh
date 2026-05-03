#!/bin/bash

# O'Reilly MCP Server Installation Script

echo "📚 Setting up O'Reilly MCP Server..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create .env file
echo "⚙️  Creating configuration..."
cat > .env << EOF
OREILLY_API_KEY=baabacb068851d225ea8adb77b895b86af889049
ANTHROPIC_API_KEY=your_anthropic_key_here
EOF

echo "✅ Installation complete!"
echo ""
echo "📝 Next steps:"
echo "1. Add your Anthropic API key to .env"
echo "2. Run: npm start"
echo ""
echo "For more information, see README.md"
