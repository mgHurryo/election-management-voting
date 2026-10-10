import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


#导入相关库
from datetime import datetime
from sqlalchemy.orm import Session
#导入repositories 文件中代码文件
from app.repositories.result import SqlAlchemyResultRepository

#设置Result服务大类
class ResultService:
    #查数据做准备
    def __init__ (self,db:Session):
        self.db=db
        self.repo=SqlAlchemyResultRepository(db)

    #计票
    def count_votes(self,election_id:int):
        return self.repo.count_votes(election_id)

    #查看结果
    def get_results(self, election_id:int):
        #先查选举状态
        election=self.repo.get_status(election_id)
        #再查票数
        total_vote=self.repo.getTotalVote(election_id)
        #合成JSON
        return {
            'election':election,
            'total_vote':total_vote
        }

    #发布结果
    def publish_results(self,election_id:int):
        return self.repo.publish(election_id)
if __name__ == "_main_":
    pass