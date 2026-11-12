// Account usernames are unique and cannot be changed through user management.
export const ROOT_ADMIN_USERNAME = "bilalcodes1";

export function isRootAccount(account) {
  return account.username?.toLowerCase() === ROOT_ADMIN_USERNAME;
}

export function isRootAdmin(account) {
  return account.role === "admin" && isRootAccount(account);
}

export function accountIdentity(account, id = account.id) {
  const { username, name, role } = account;
  return { id, username, name, role, is_root: isRootAdmin(account) };
}

export function managedAccount(account, manager) {
  const isRoot = isRootAccount(account);
  return {
    ...account,
    is_root: isRoot,
    can_manage: manager.role === "admin" && !isRoot && account.id !== manager.user_id &&
      (isRootAdmin(manager) || account.role === "editor")
  };
}
