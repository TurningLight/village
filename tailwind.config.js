/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 主色系统 - 乡村生态绿
        primary: {
          DEFAULT: '#173B32', // 深森林绿
          light: '#438B69',   // 生态绿
          lighter: '#A9D7B4', // 嫩绿
        },
        // 页面背景
        background: '#F5F7F4',
        // 卡片
        card: '#FFFFFF',
        // 文字
        text: {
          DEFAULT: '#24342E',
          secondary: '#77867D',
        },
        // 状态色
        warning: '#E5A04E',
        danger: '#D66A5E',
        // 地图元素
        water: '#8FC8D8',
      },
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
