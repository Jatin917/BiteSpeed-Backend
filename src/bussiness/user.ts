import { User, LinkPrecedence } from "../generated/prisma/client";

export const turnOldestToPrimary = async (
  user1: User,
  user2: User
): Promise<void> => {
    try {
        if(user1.createdAt<user2.createdAt){
            await prisma?.user.update({where:{id:user2.id}, data:{linkedId:user1.id, linkPrecedence:LinkPrecedence.SECONDARY}});
        }
        else{
            await prisma?.user.update({where:{id:user1.id}, data:{linkedId:user2.id, linkPrecedence:LinkPrecedence.SECONDARY}});
        }
        return;
    } catch (error) {
        console.log(error);
        return;
    }
};
