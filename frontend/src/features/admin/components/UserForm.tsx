import type { AdminUser } from "../api/admin.api";
import type { CreateUserFormValues, EditUserFormValues } from "../schema/Admin.schema";
import CreateUserForm from "./CreateUserForm";
import EditUserForm from "./EditUserForm";

type Props =
  | {
      mode: "create";
      onSubmit: (data: CreateUserFormValues) => void;
      isPending: boolean;
      onCancel: () => void;
    }
  | {
      mode: "edit";
      defaultValues: AdminUser;
      onSubmit: (data: EditUserFormValues) => void;
      isPending: boolean;
      onCancel: () => void;
    };

const UserForm = (props: Props) => {
  if (props.mode === "create") {
    return <CreateUserForm {...props} />;
  }
  return <EditUserForm {...props} />;
};

export default UserForm;
