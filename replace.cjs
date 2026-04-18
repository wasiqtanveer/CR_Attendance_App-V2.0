const fs = require('fs');
let code = fs.readFileSync('src/pages/ProfilePage.jsx', 'utf8');

const oldStr = `            <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-5" />

            <div>
              <label className="block text-xs font-black uppercase tracking-wide text-gray-400 mb-4">
                Change Password
              </label>
              
              {passwordSuccess && (
                <div className="border-2 border-green-400 bg-green-50 dark:bg-green-950 text-green-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                  Password updated successfully!
                </div>
              )}
              
              {passwordError && (
                <div className="border-2 border-red-400 bg-red-50 dark:bg-red-950 text-red-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                  {passwordError}
                </div>
              )}

              <input
                type="password"
                placeholder="Current Password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
              />
              <input
                type="password"
                placeholder="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
              />
              
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleUpdatePassword}
                disabled={isUpdatingPassword}
                className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full"
              >
                {isUpdatingPassword ? 'Updating...' : 'Update Password →'}
              </motion.button>
            </div>`;

const newStr = `            <div className="border-t-2 border-dashed border-gray-100 dark:border-gray-800 my-5" />

            <div>
              <button 
                onClick={() => setIsPasswordAccordionOpen(!isPasswordAccordionOpen)}
                className="flex items-center justify-between w-full text-left focus:outline-none mb-4 group"
              >
                <span className="block text-xs font-black uppercase tracking-wide text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors">
                  Change Password
                </span>
                {isPasswordAccordionOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors" />
                )}
              </button>
              
              <AnimatePresence>
                {isPasswordAccordionOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1 pb-2">
                      {passwordSuccess && (
                        <div className="border-2 border-green-400 bg-green-50 dark:bg-green-950 text-green-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                          Password updated successfully!
                        </div>
                      )}
                      
                      {passwordError && (
                        <div className="border-2 border-red-400 bg-red-50 dark:bg-red-950 text-red-600 rounded-xl px-4 py-2 text-xs font-bold mb-4">
                          {passwordError}
                        </div>
                      )}

                      <input
                        type="password"
                        placeholder="Current Password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
                      />
                      <input
                        type="password"
                        placeholder="New Password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
                      />
                      <input
                        type="password"
                        placeholder="Confirm New Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-transparent border-2 border-black dark:border-white rounded-xl px-4 py-2.5 text-sm font-bold text-gray-900 dark:text-white focus:outline-none focus:border-[#b9ff66] mb-3"
                      />
                      
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={handleUpdatePassword}
                        disabled={isUpdatingPassword}
                        className="bg-[#b9ff66] border-2 border-black text-black font-bold py-2.5 rounded-xl hover:bg-black hover:text-[#b9ff66] transition-all duration-150 text-sm w-full mb-2"
                      >
                        {isUpdatingPassword ? 'Updating...' : 'Update Password →'}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>`;

if (code.includes(oldStr)) {
  fs.writeFileSync('src/pages/ProfilePage.jsx', code.replace(oldStr, newStr));
  console.log('REPLACED');
} else {
  console.log('NOT FOUND');
}
